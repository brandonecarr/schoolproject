// Structural guard: the interpretive half of the engagement signal must never
// reach a family.
//
// lib/engagement.ts states the rule in a comment, and a comment is worth
// nothing on the day someone adds an engagement chip to the parent dashboard
// because it seemed helpful. This test reads the actual source of every
// family-facing surface and fails the build if the teacher-only vocabulary
// appears there.
//
// The line being enforced: a COUNT is a fact about work ("produced work on 12
// of 14 expected days") and may go on a record a family or a state reviewer
// reads. A STATE is an interpretation of a child ("worth a check-in"), which is
// the teacher's to make and to raise in their own words — not something we
// publish to a parent about their nine-year-old.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

/** Every surface a parent or student can reach. */
const FAMILY_FACING = [
  "src/app/(portal)", // the whole parent + student portal
  "src/app/records", // printed student record — parents and students may read it
];

/** Teacher-only exports of lib/engagement.ts. */
const TEACHER_ONLY = ["stateLabel", "stateTone", "teacherPrompt", "CheckInReason"];

function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) return walk(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
}

const files = FAMILY_FACING.flatMap(walk);

describe("engagement — what a family may see", () => {
  it("finds the family-facing files it claims to be checking", () => {
    // Without this, a renamed route group turns the whole suite into a
    // zero-file loop that passes by checking nothing.
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.includes("parent"))).toBe(true);
    expect(files.some((f) => f.includes("student"))).toBe(true);
    expect(files.some((f) => f.includes("records"))).toBe(true);
  });

  it("never imports the teacher-only half of the signal", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), "utf8");
      // Only care about symbols actually pulled in from the engagement module.
      const imports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/engagement["']/g)]
        .flatMap((m) => m[1].split(","))
        .map((s) => s.replace(/\btype\b/, "").trim())
        .filter(Boolean);
      for (const sym of imports) {
        if (TEACHER_ONLY.includes(sym)) offenders.push(`${f} imports ${sym}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never renders the state or the reason", () => {
    // Catches the case where someone reaches through the evidence object
    // (`e.engagement.state`) instead of importing a helper.
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), "utf8");
      for (const m of src.matchAll(/engagement[\s?.]*\.\s*(state|reason)\b/g)) {
        offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("engagement — the factual line stays factual", () => {
  it("keeps interpretive words out of the family-facing helper", () => {
    // factualSummary() is the one engagement string a family may read, so its
    // wording is a privacy boundary rather than a copy decision.
    const src = readFileSync(join(ROOT, "src/lib/engagement.ts"), "utf8");
    const fn = src.slice(src.indexOf("export function factualSummary"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    for (const word of ["check-in", "quiet", "silent", "steady", "slipping", "disengaged", "concern"]) {
      expect(body.toLowerCase()).not.toContain(word);
    }
  });
});
