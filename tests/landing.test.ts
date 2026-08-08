// The marketing page may not claim more than the code has verified.
//
// This is the only test file whose subject is a landing page, and it exists
// because a landing page is the single easiest place in a codebase to overstate
// what a product does. rules.ts already says that shipping unverified rules as
// fact gets a school's funding clawed back; these tests make the public page
// obey that rather than trusting whoever edits the copy next.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { landingStates, STATE_NAMES } from "@/lib/landing";
import { PROGRAMS, RAILS } from "@/lib/rules";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the state table is derived, not written", () => {
  const states = landingStates();

  it("lists every configured program and no others", () => {
    expect(states.length).toBe(Object.keys(PROGRAMS).length);
    expect(states.map((s) => s.code).sort()).toEqual(Object.keys(PROGRAMS).sort());
  });

  it("flags a state exactly when its rail is unverified", () => {
    for (const s of states) {
      const rail = RAILS[PROGRAMS[s.code].rail];
      expect(s.unverified, s.code).toBe(rail.verify);
    }
  });

  it("flags every state today, because every rail is still verify:true", () => {
    // The handoff's design showed Arizona and Florida as "Supported". That was
    // a guess made in a design tool. If this test ever fails it means a real
    // invoice cycle was observed and a flag came off in rules.ts — at which
    // point the page is already telling the truth and this expectation should
    // be relaxed, not the flag restored.
    expect(states.every((s) => s.unverified)).toBe(true);
  });

  it("never renders a bare state code as a name", () => {
    for (const s of states) {
      expect(s.name, s.code).not.toBe(s.code);
      expect(s.name.length, s.code).toBeGreaterThan(3);
    }
  });

  it("names every state a program could be added for", () => {
    // Adding a state to PROGRAMS must not be able to put "MO" on the marketing
    // page — a silent failure that is public the moment it happens.
    expect(Object.keys(STATE_NAMES).length).toBeGreaterThanOrEqual(51);
  });

  it("says who administers each program, not just what kind it is", () => {
    for (const s of states) {
      expect(s.program, s.code).toMatch(/·/);
    }
  });

  it("is ordered alphabetically by name, so a reader can find theirs", () => {
    const names = states.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("the page cannot hardcode coverage around the derivation", () => {
  const page = read("src/app/page.tsx");
  const code = page.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  it("derives the states strip from landingStates()", () => {
    expect(code).toContain("landingStates()");
  });

  it("derives the workflow chips from rules.ts, never written out", () => {
    // The full per-state honesty table moved to /states (states.test.ts holds
    // it there). What the landing keeps is the rule that it cannot NAME a rail
    // or program the code doesn't carry: chip labels come from RAILS/PROGRAMS.
    expect(code).toContain("Object.values(RAILS)");
    expect(code).not.toMatch(/"ClassWallet"|"Step Up For Students"|"Odyssey"/);
  });

  it("does not spell out a list of supported states in prose", () => {
    // The signup form carried a hand-written "AZ, FL, IA, UT and AR" for months
    // after PROGRAMS held 23. The same sentence must not reappear here.
    expect(code).not.toMatch(/AZ,\s*FL|Arizona,\s*Florida,\s*Iowa/);
  });

  it("keeps the no-guarantee line next to the program chips", () => {
    expect(code).toMatch(/guarantee program\s+approval, reimbursement, or compliance outcomes/);
    expect(code).toContain("⚑");
  });

  it("still links to the state-by-state guide", () => {
    expect(code).toContain('href="/states"');
  });
});

describe("the limits section stays on the page", () => {
  // The apex route's own comment: these belong on the page rather than in the
  // small print, because a landing page that oversells this product gets a
  // microschool's funding rejected. A redesign is exactly when they get cut.
  const page = read("src/app/page.tsx");

  it.each([
    ["never holds your money", /never holds your money/i],
    ["never submits for you", /never submits for you/i],
    ["flags what it hasn't verified", /flags what it hasn/i],
    ["accounts come from parents", /accounts come from parents/i],
  ])("still states that it %s", (_name, re) => {
    expect(page).toMatch(re);
  });

  it("still tells a family at the apex they cannot sign in here", () => {
    expect(page).toMatch(/Sign in at your own address, not this one/);
  });
});
