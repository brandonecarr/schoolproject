// The Tier-1 sweep: fetch every watched source, fingerprint it, store the ones
// that moved. Extracted from the route handler so it can be run from a script
// and tested against real sources without going through HTTP.
//
// Explicitly NOT here: any model call, any interpretation, any writing to
// rules.ts. This layer only ever answers "did this page change".

import { prisma } from "@/lib/db";
import { SOURCES, type WatchSource } from "@/lib/sources";
import { fingerprint, summarizeChange, shouldEscalate } from "@/lib/watch";

/** Per-request ceiling. Government sites are slow; 20s is generous but bounded. */
const FETCH_TIMEOUT_MS = 20_000;
/** Refuse to buffer a huge response. A rules page is tens of KB; 5MB is a
 *  runaway download, not a handbook. */
const MAX_BYTES = 5_000_000;
/** Politeness and self-preservation: don't open 30 sockets at once, and don't
 *  look like an attack to a state DOE's WAF. */
const CONCURRENCY = 4;

export type SourceResult = {
  sourceId: string;
  label: string;
  url: string;
  status: "ok" | "blocked" | "http_error" | "fetch_error" | "too_small";
  httpStatus: number;
  changed: boolean;
  escalated: boolean;
  bytes: number;
  textLength: number;
  delta: number;
  magnitude: number;
  error?: string;
};

async function fetchPage(
  url: string
): Promise<{ ok: true; html: string; httpStatus: number; bytes: number } | { ok: false; error: string; httpStatus: number }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: {
        // The conventional self-identifying crawler form — the same shape
        // Googlebot and Bingbot use. It declares that we are a bot and gives a
        // contact URL, so a site owner can still block or reach us. We do NOT
        // impersonate a person: a watcher nobody can ask to stop is one that
        // deserves to be blocked. The "Mozilla/5.0 (compatible; ...)" prefix is
        // there because several state WAFs 403 any UA they don't recognise as a
        // known client, and four real program pages were unreachable without it.
        "user-agent":
          "Mozilla/5.0 (compatible; CohortRuleWatcher/1.0; +https://github.com/brandonecarr/schoolproject)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, httpStatus: res.status };

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return { ok: false, error: `response too large (${buf.byteLength} bytes)`, httpStatus: res.status };
    }
    return {
      ok: true,
      html: new TextDecoder("utf-8", { fatal: false }).decode(buf),
      httpStatus: res.status,
      bytes: buf.byteLength,
    };
  } catch (e) {
    return {
      ok: false,
      error: ctl.signal.aborted ? `timed out after ${FETCH_TIMEOUT_MS}ms` : describeFetchError(e),
      httpStatus: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Node's fetch reports nearly every network failure as the word "fetch failed"
 * and hides the real reason one level down in `cause`. That is useless in a
 * health dashboard — "fetch failed" gives no clue whether a URL is wrong, a
 * host is gone, or a state is serving a broken certificate chain, and those
 * need completely different fixes. Walk the chain and say what happened.
 */
function describeFetchError(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  const seen = new Set<unknown>();
  while (cur instanceof Error && !seen.has(cur)) {
    seen.add(cur);
    const code = (cur as NodeJS.ErrnoException).code;
    const line = code ? `${code}: ${cur.message}` : cur.message;
    if (!parts.includes(line)) parts.push(line);
    cur = (cur as { cause?: unknown }).cause;
  }
  const detail = parts.filter((p) => p !== "fetch failed").join(" — ") || parts.join(" — ");
  // Translate the two that come up constantly on government sites into
  // something that says what to actually do about it.
  if (detail.includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE"))
    return `${detail} (server omits its intermediate certificate — find an alternate URL; do NOT disable verification, this feed decides what schools bill)`;
  if (detail.includes("ENOTFOUND")) return `${detail} (host does not exist — the URL is wrong)`;
  return detail || String(e);
}

async function checkOne(src: WatchSource): Promise<SourceResult> {
  const now = new Date().toISOString();
  const base = {
    sourceId: src.id,
    label: src.label,
    url: src.url,
    changed: false,
    escalated: false,
    bytes: 0,
    textLength: 0,
    delta: 0,
    magnitude: 0,
  };

  const prev = await prisma.watchState.findUnique({ where: { sourceId: src.id } });
  const res = await fetchPage(src.url);

  if (!res.ok) {
    // 401/403/429 mean the page is probably fine and we are the problem —
    // a bot-detection WAF. That needs a different fix (a non-WAF'd URL, a PDF
    // handbook, or manual review) from a 404, which just means the URL is
    // wrong. Conflating them buries the ones that are actually fixable.
    const status: SourceResult["status"] = !res.httpStatus
      ? "fetch_error"
      : [401, 403, 429].includes(res.httpStatus)
        ? "blocked"
        : "http_error";
    await prisma.watchState.upsert({
      where: { sourceId: src.id },
      create: { sourceId: src.id, lastAttemptAt: now, lastStatus: status, lastError: res.error, failureStreak: 1 },
      update: {
        lastAttemptAt: now,
        lastStatus: status,
        lastError: res.error,
        // Streak, not a boolean: one blip is noise, five in a row is a dead URL.
        failureStreak: { increment: 1 },
      },
    });
    return { ...base, status, httpStatus: res.httpStatus, error: res.error };
  }

  const { text, normalized, hash } = fingerprint(res.html);

  // A page that extracts to almost nothing is a JS-only shell, a login wall or
  // an error page. Recording its hash would mean the next real page load looks
  // like a huge "change", so refuse it and say so.
  if (normalized.length < 200) {
    await prisma.watchState.upsert({
      where: { sourceId: src.id },
      create: { sourceId: src.id, lastAttemptAt: now, lastStatus: "too_small", lastError: `only ${normalized.length} chars of text`, failureStreak: 1 },
      update: { lastAttemptAt: now, lastStatus: "too_small", lastError: `only ${normalized.length} chars of text`, failureStreak: { increment: 1 } },
    });
    return { ...base, status: "too_small", httpStatus: res.httpStatus, bytes: res.bytes, textLength: normalized.length };
  }

  const changed = prev?.lastHash !== hash;
  let delta = 0;
  let magnitude = 0;
  let escalated = false;

  if (changed) {
    const last = await prisma.sourceSnapshot.findFirst({
      where: { sourceId: src.id },
      orderBy: { fetchedAt: "desc" },
      select: { text: true },
    });
    const summary = summarizeChange(last?.text ?? null, text);
    delta = summary.delta;
    magnitude = summary.magnitude;
    // A first sighting is a "change" but there is nothing to interpret it
    // against, so it never escalates — it is only the baseline.
    //
    // Gated on a previous SNAPSHOT, not a previous WatchState row: a source
    // that 404'd for a week already has a WatchState (recording the failures),
    // so keying on that made every URL fix look like a material rule change and
    // escalated it straight to a model call.
    escalated = last != null && shouldEscalate(summary, text.length);

    await prisma.sourceSnapshot.create({
      data: {
        sourceId: src.id,
        url: src.url,
        hash,
        text,
        fetchedAt: now,
        httpStatus: res.httpStatus,
        delta,
        magnitude,
        escalated,
      },
    });
  }

  await prisma.watchState.upsert({
    where: { sourceId: src.id },
    create: {
      sourceId: src.id,
      lastCheckedAt: now,
      lastAttemptAt: now,
      lastChangedAt: now,
      lastHash: hash,
      lastStatus: "ok",
      lastError: "",
      failureStreak: 0,
      pendingReview: false,
    },
    update: {
      lastCheckedAt: now,
      lastAttemptAt: now,
      ...(changed ? { lastChangedAt: now, lastHash: hash } : {}),
      lastStatus: "ok",
      lastError: "",
      failureStreak: 0,
      // Sticky until step 3 drains it: a change must not be lost because a
      // later unchanged run cleared the flag.
      ...(escalated ? { pendingReview: true } : {}),
    },
  });

  return { ...base, status: "ok", httpStatus: res.httpStatus, changed, escalated, bytes: res.bytes, textLength: text.length, delta, magnitude };
}

/** Run `limit` workers over the source list. */
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export type SweepReport = {
  startedAt: string;
  finishedAt: string;
  checked: number;
  ok: number;
  changed: number;
  escalated: number;
  failed: number;
  results: SourceResult[];
};

export async function runSweep(only?: string[]): Promise<SweepReport> {
  const startedAt = new Date().toISOString();
  const list = only?.length ? SOURCES.filter((s) => only.includes(s.id)) : SOURCES;

  // One bad source must never abort the sweep — the other 28 still need checking.
  const results = await pool(list, CONCURRENCY, async (s) => {
    try {
      return await checkOne(s);
    } catch (e) {
      return {
        sourceId: s.id,
        label: s.label,
        url: s.url,
        status: "fetch_error" as const,
        httpStatus: 0,
        changed: false,
        escalated: false,
        bytes: 0,
        textLength: 0,
        delta: 0,
        magnitude: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    checked: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    changed: results.filter((r) => r.changed).length,
    escalated: results.filter((r) => r.escalated).length,
    failed: results.filter((r) => r.status !== "ok").length,
    results,
  };
}
