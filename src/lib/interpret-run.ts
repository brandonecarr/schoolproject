// Drain the Tier-1 backlog: for every source flagged pendingReview, interpret
// the change and record a proposal.
//
// Separate from the Tier-1 sweep on purpose. Detection must keep working when
// the model is down, the API key is missing, or the bill is capped — if these
// shared one job, an Anthropic outage would silently stop us noticing that a
// state changed its award.

import { prisma } from "@/lib/db";
import { sourceById } from "@/lib/sources";
import { interpretChange } from "@/lib/interpret";
import { patchProgramLine, proposalBody, branchName, isPatchable } from "@/lib/propose";
import { openRulesPr, prConfigured } from "@/lib/github";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type InterpretResult = {
  sourceId: string;
  snapshotId?: string;
  outcome: "no_change_pending" | "interpreted" | "skipped" | "model_unavailable" | "error";
  material?: boolean;
  summary?: string;
  patched?: number;
  manual?: number;
  prUrl?: string;
  prError?: string;
  error?: string;
};

/** Read the current PROGRAMS line for a state out of rules.ts on disk. */
async function currentProgramLine(state: string): Promise<string | null> {
  try {
    const src = await readFile(path.join(process.cwd(), "src/lib/rules.ts"), "utf8");
    const line = src.split("\n").find((l) => new RegExp(`^\\s*${state}:\\s*\\{`).test(l));
    return line ?? null;
  } catch {
    return null;
  }
}

async function interpretOne(sourceId: string, opts: { openPr: boolean }): Promise<InterpretResult> {
  const src = sourceById(sourceId);
  if (!src) return { sourceId, outcome: "error", error: "unknown source id" };

  // The two most recent snapshots: the change, and what it changed from.
  const snaps = await prisma.sourceSnapshot.findMany({
    where: { sourceId },
    orderBy: { fetchedAt: "desc" },
    take: 2,
  });
  const latest = snaps[0];
  const previous = snaps[1];
  if (!latest || !previous) {
    // Only a baseline exists — nothing to compare against. Clear the flag so it
    // doesn't sit in the queue forever.
    await prisma.watchState.updateMany({ where: { sourceId }, data: { pendingReview: false } });
    return { sourceId, outcome: "skipped" };
  }

  // Idempotency: one proposal per snapshot, so a retried cron never re-spends
  // a model call on a diff it already judged.
  const existing = await prisma.ruleProposal.findUnique({ where: { snapshotId: latest.id } });
  if (existing) {
    await prisma.watchState.updateMany({ where: { sourceId }, data: { pendingReview: false } });
    return { sourceId, snapshotId: latest.id, outcome: "skipped", material: existing.material };
  }

  const got = await interpretChange({ source: src, before: previous.text, after: latest.text });
  if (!got) {
    // Leave pendingReview SET. A missing key or a failed call is "not yet
    // interpreted", never "nothing changed" — dropping the flag here would lose
    // the change permanently.
    return { sourceId, snapshotId: latest.id, outcome: "model_unavailable" };
  }

  const { verdict, model } = got;

  // Build the patch mechanically. The model's claims never touch the file.
  let patch = "";
  let applied: ReturnType<typeof patchProgramLine>["applied"] = [];
  let manual: ReturnType<typeof patchProgramLine>["manual"] = [];
  let programLine: string | null = null;

  if (verdict.material && src.programCode) {
    programLine = await currentProgramLine(src.programCode);
    if (programLine) {
      const r = patchProgramLine(src.programCode, programLine, verdict.changes);
      patch = r.patch;
      applied = r.applied;
      manual = r.manual;
    }
  } else if (verdict.material) {
    // Rail-level or tracker change: nothing on PROGRAMS to patch, so everything
    // is a human decision.
    manual = verdict.changes.map((change) => ({
      change,
      reason: src.railId
        ? "Administrator-level change — affects every state on this rail, so it is never auto-patched."
        : "Aggregator change — may mean a new state's program exists. Needs a human to add it.",
    }));
  }

  const proposal = await prisma.ruleProposal.create({
    data: {
      sourceId,
      snapshotId: latest.id,
      material: verdict.material,
      confidence: verdict.confidence,
      summary: verdict.summary,
      changesJson: JSON.stringify(verdict.changes),
      programCode: src.programCode ?? null,
      railId: src.railId ?? null,
      patch,
      model,
      status: "open",
    },
  });

  // Immaterial verdicts are recorded and the flag cleared — that record is what
  // stops us paying to re-read the same footer tweak.
  await prisma.watchState.updateMany({ where: { sourceId }, data: { pendingReview: false } });

  const base: InterpretResult = {
    sourceId,
    snapshotId: latest.id,
    outcome: "interpreted",
    material: verdict.material,
    summary: verdict.summary,
    patched: applied.length,
    manual: manual.length,
  };

  if (!opts.openPr || !verdict.material || !patch || !programLine) return base;
  if (!prConfigured()) return { ...base, prError: "GITHUB_TOKEN / GITHUB_REPO not configured" };

  const newLine = patch.split("\n").find((l) => l.startsWith("+") && !l.startsWith("+++"))!.slice(1);
  const pr = await openRulesPr({
    branch: branchName(sourceId, latest.id),
    title: `${src.label}: ${verdict.summary}`.slice(0, 120),
    body: proposalBody({
      sourceLabel: src.label,
      url: src.url,
      summary: verdict.summary,
      confidence: verdict.confidence,
      applied,
      manual,
      magnitude: latest.magnitude,
      model,
    }),
    expectedLine: programLine,
    newLine,
  });

  if (pr.ok) {
    await prisma.ruleProposal.update({
      where: { id: proposal.id },
      data: { status: "pr_opened", prUrl: pr.url },
    });
    return { ...base, prUrl: pr.url };
  }
  return { ...base, prError: pr.error };
}

export type InterpretReport = {
  startedAt: string;
  finishedAt: string;
  pending: number;
  interpreted: number;
  material: number;
  prsOpened: number;
  results: InterpretResult[];
};

export async function runInterpretation(opts: { openPr?: boolean; only?: string[] } = {}): Promise<InterpretReport> {
  const startedAt = new Date().toISOString();
  const pending = await prisma.watchState.findMany({
    where: { pendingReview: true, ...(opts.only?.length ? { sourceId: { in: opts.only } } : {}) },
    select: { sourceId: true },
  });

  const results: InterpretResult[] = [];
  // Sequential: these are model calls against a handful of sources on a rare
  // path. Concurrency here would buy nothing and risks a rate-limit storm.
  for (const { sourceId } of pending) {
    try {
      results.push(await interpretOne(sourceId, { openPr: opts.openPr ?? false }));
    } catch (e) {
      results.push({ sourceId, outcome: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    pending: pending.length,
    interpreted: results.filter((r) => r.outcome === "interpreted").length,
    material: results.filter((r) => r.material).length,
    prsOpened: results.filter((r) => r.prUrl).length,
    results,
  };
}

/** Exposed for the manual runner so a single change can be re-judged. */
export { interpretOne };
