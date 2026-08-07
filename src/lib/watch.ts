// Tier-1 change detection: is this page different from yesterday?
//
// No model runs here and none should. The entire job is to turn a fetched HTML
// page into a stable fingerprint, cheaply enough to run against every source
// every day. Interpretation is Tier 2's problem and only ever sees pages this
// file says actually moved.
//
// NORMALISATION IS THE WHOLE GAME. A naive hash of raw HTML changes every
// single day on nearly every real site — CSRF tokens, cache-busting build
// hashes, "generated at" timestamps, rotating ad slots, session ids. A watcher
// that cries wolf daily gets ignored within a week, and then it may as well not
// exist. So this strips aggressively and errs toward under-reporting: a missed
// change costs us one day of latency on a rule that moves twice a year, while a
// false alarm costs attention, which is the scarce resource.

import { createHash } from "node:crypto";

/** Hard cap on stored text. Enough for a long program handbook page, small
 *  enough that 30 sources changing at once can't bloat the database. */
export const MAX_TEXT = 200_000;

/**
 * Pull readable text out of an HTML document.
 *
 * Deliberately regex-based rather than a DOM parser: we are not rendering this,
 * we are fingerprinting it, and a parser dependency would have to be kept safe
 * against hostile markup for no gain. Everything here only ever deletes.
 */
export function extractText(html: string): string {
  let s = html;
  // Whole elements whose content is never prose, removed with their contents.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ");
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // Block-level tags become newlines so paragraph structure survives; the rest
  // just disappear.
  s = s.replace(/<\/?(p|div|br|li|tr|h[1-6]|section|article|table)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s;
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
    rsquo: "’",
    lsquo: "‘",
    ldquo: "“",
    rdquo: "”",
    hellip: "…",
  };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => named[String(n).toLowerCase()] ?? m);
}

function safeCodePoint(n: number): string {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

/**
 * Strip the parts of a page that change without the content changing.
 *
 * Each pattern below is here because it would otherwise fire a false alarm
 * every single day. Order matters: volatile tokens go before whitespace
 * collapsing so the placeholder text doesn't glue words together.
 */
export function normalizeForHash(text: string): string {
  let s = text;

  // Long hex / base64-ish runs: CSRF tokens, build hashes, cache keys, nonces.
  s = s.replace(/\b[0-9a-f]{16,}\b/gi, " ");
  s = s.replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, " ");

  // Timestamps and "generated at" clocks. Dates on their own are NOT stripped —
  // a changed application deadline is exactly the signal we want — but a
  // wall-clock time attached to page generation is pure noise.
  s = s.replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/gi, " ");
  s = s.replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, " ");

  // Visitor counters, session ids and cache-busters in surviving URLs.
  s = s.replace(/[?&](v|ver|t|ts|_|cb|sid|session|nonce)=[^\s&]*/gi, " ");

  // Zero-width, bidi-control and exotic space characters. Invisible, so an
  // editor can add or drop one without meaning to. Written as escapes because
  // the literals are unreadable in source (and broke the parser once).
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00A0\u2000-\u200A]/g, " ");

  // Collapse all whitespace last, so removals above can't fuse two words.
  s = s.replace(/\s+/g, " ").trim().toLowerCase();

  return s.slice(0, MAX_TEXT);
}

/** Stable fingerprint of a page's meaningful content. */
export function hashText(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** Fetch → fingerprint, in one step. */
export function fingerprint(html: string): { text: string; normalized: string; hash: string } {
  const text = extractText(html).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const normalized = normalizeForHash(text);
  return { text: text.slice(0, MAX_TEXT), normalized, hash: hashText(normalized) };
}

// --- Change description -----------------------------------------------------

export type ChangeSummary = {
  changed: boolean;
  /** Net character change in the normalized text. Sign carries meaning: a big
   *  negative swing often means the page broke or went behind a login, not that
   *  a rule was deleted. */
  delta: number;
  /** Rough share of the text that moved, 0..1. Used to tell a typo fix from a
   *  rewrite before spending a model call on it in Tier 2. */
  magnitude: number;
};

export function summarizeChange(before: string | null, after: string): ChangeSummary {
  if (before === null) return { changed: true, delta: after.length, magnitude: 1 };
  if (before === after) return { changed: false, delta: 0, magnitude: 0 };
  const delta = after.length - before.length;
  // Token-level Jaccard distance: cheap, order-insensitive, and good enough to
  // separate "one word edited" from "page replaced".
  const a = new Set(before.split(" "));
  const b = new Set(after.split(" "));
  let shared = 0;
  for (const t of b) if (a.has(t)) shared++;
  const union = a.size + b.size - shared;
  const magnitude = union === 0 ? 0 : 1 - shared / union;
  return { changed: true, delta, magnitude };
}

/**
 * Should a detected change be escalated to Tier 2 (a model call)?
 *
 * Cheap gate in front of the expensive step. A microscopic edit is nearly
 * always a typo fix or a phone number; a change that empties the page is a
 * fetch problem masquerading as an edit and should be looked at by a human, not
 * summarised by a model as if the rules had been deleted.
 */
export function shouldEscalate(c: ChangeSummary, afterLength: number): boolean {
  if (!c.changed) return false;
  if (afterLength < 500) return false; // page is broken, empty, or a login wall
  return c.magnitude >= 0.02;
}
