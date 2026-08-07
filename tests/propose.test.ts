import { describe, it, expect } from "vitest";
import {
  patchProgramLine,
  proposalBody,
  branchName,
  isPatchable,
  PATCHABLE,
  type ProposedChange,
} from "@/lib/propose";

// The real Arizona line, so the patcher is exercised against actual source.
const AZ_LINE = `  AZ: { rail: "classwallet", program: "Empowerment Scholarship Account", label: "Arizona ESA", kind: "esa", amount: 7400, live: true },`;

/** The added line of the diff — not the `+++` header, which also starts with "+". */
const added = (patch: string) => patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
const addedLine = (patch: string) => added(patch)[0] ?? "";

const change = (o: Partial<ProposedChange> & { field: ProposedChange["field"] }): ProposedChange => ({
  before: "",
  after: "",
  quote: "the page says so",
  ...o,
});

describe("patchProgramLine — the model's claims become an edit, mechanically", () => {
  it("updates an award amount and shows it as a diff", () => {
    const r = patchProgramLine("AZ", AZ_LINE, [
      change({ field: "amount", before: "7400", after: "$7,600", quote: "awards are $7,600 for 2026-27" }),
    ]);
    expect(r.applied).toHaveLength(1);
    expect(r.patch).toContain("-  AZ: { rail:");
    expect(r.patch).toContain("amount: 7600");
    expect(r.patch).not.toContain("amount: 7400\n+");
  });

  it("parses money written the way a government page writes it", () => {
    for (const raw of ["$7,600", "7600", "7,600 per student per year", "up to $7,600."]) {
      const r = patchProgramLine("AZ", AZ_LINE, [change({ field: "amount", after: raw })]);
      expect(r.applied, raw).toHaveLength(1);
      expect(r.patch, raw).toContain("amount: 7600");
    }
  });

  it("leaves every other field on the line untouched", () => {
    const r = patchProgramLine("AZ", AZ_LINE, [change({ field: "amount", after: "7600" })]);
    const plus = addedLine(r.patch);
    expect(plus).toContain('rail: "classwallet"');
    expect(plus).toContain('program: "Empowerment Scholarship Account"');
    expect(plus).toContain("live: true");
  });

  it("applies several fields in one edit", () => {
    const r = patchProgramLine("AZ", AZ_LINE, [
      change({ field: "amount", after: "8000" }),
      change({ field: "live", after: "false" }),
    ]);
    expect(r.applied).toHaveLength(2);
    const plus = addedLine(r.patch);
    expect(plus).toContain("amount: 8000");
    expect(plus).toContain("live: false");
  });
});

describe("patchProgramLine — what it refuses to automate", () => {
  it("never changes the administrator, however confident the model is", () => {
    // A wrong rail is an instant rejection, not a wrong number. This one always
    // goes to a human, by design.
    const r = patchProgramLine("AZ", AZ_LINE, [
      change({ field: "rail", before: "classwallet", after: "odyssey", quote: "now administered by Odyssey" }),
    ]);
    expect(r.applied).toHaveLength(0);
    expect(r.patch).toBe("");
    expect(r.manual[0].reason).toContain("instant rejection");
  });

  it("drops a claim with no supporting quote", () => {
    const r = patchProgramLine("AZ", AZ_LINE, [change({ field: "amount", after: "9999", quote: "  " })]);
    expect(r.applied).toHaveLength(0);
    expect(r.manual[0].reason).toContain("No supporting quote");
  });

  it("rejects an implausible amount rather than writing it", () => {
    for (const bad of ["0", "-500", "1000000", "lots", ""]) {
      const r = patchProgramLine("AZ", AZ_LINE, [change({ field: "amount", after: bad })]);
      expect(r.applied, bad).toHaveLength(0);
    }
  });

  it("rejects a kind outside the known set", () => {
    expect(patchProgramLine("AZ", AZ_LINE, [change({ field: "kind", after: "crypto" })]).applied).toHaveLength(0);
    expect(patchProgramLine("AZ", AZ_LINE, [change({ field: "kind", after: "voucher" })]).applied).toHaveLength(1);
  });

  it("does not invent a field the entry does not have", () => {
    const r = patchProgramLine("AZ", AZ_LINE, [change({ field: "limited", after: "students with a disability" })]);
    expect(r.applied).toHaveLength(0);
    expect(r.manual[0].reason).toContain("not present");
  });

  it("reports no edit when the value already matches", () => {
    const r = patchProgramLine("AZ", AZ_LINE, [change({ field: "amount", after: "7400" })]);
    expect(r.applied).toHaveLength(0);
    expect(r.patch).toBe("");
  });
});

describe("patchProgramLine — hostile page content cannot escape the literal", () => {
  // The page being interpreted is untrusted. The property that matters is NOT
  // that attacker text is absent from the line — it will be present, as data.
  // It is that the line still evaluates to an object of the same shape, with no
  // new keys and no other field disturbed. So evaluate it and look.
  const evalEntry = (patch: string): Record<string, unknown> => {
    const line = addedLine(patch).slice(1).trim().replace(/,$/, "");
    // "AZ: { ... }" -> the object
    const obj = line.slice(line.indexOf("{"));
    return Function(`"use strict"; return (${obj});`)() as Record<string, unknown>;
  };

  it("keeps an injected object literal as inert string data", () => {
    const r = patchProgramLine("AZ", AZ_LINE, [
      change({ field: "label", after: '", live: false, evil: require("fs"), x: "' }),
    ]);
    const e = evalEntry(r.patch);
    expect(Object.keys(e).sort()).toEqual(["amount", "kind", "label", "live", "program", "rail"]);
    expect(e.evil).toBeUndefined();
    expect(e.live).toBe(true); // the injected `live: false` did NOT take effect
    expect(typeof e.label).toBe("string");
    expect(e.label).toContain("evil"); // present, but only as text
  });

  it("keeps an injected statement as inert string data", () => {
    const r = patchProgramLine("AZ", AZ_LINE, [change({ field: "label", after: "ok\n  process.exit(1)\n" })]);
    expect(added(r.patch)).toHaveLength(1); // no extra line smuggled in
    const e = evalEntry(r.patch);
    expect(Object.keys(e).sort()).toEqual(["amount", "kind", "label", "live", "program", "rail"]);
    // Present as text, but flattened to a single line — the property that
    // matters is that it is a string value, not a second line of source.
    expect(e.label).not.toMatch(/[\r\n]/);
    expect(e.label).toBe("ok   process.exit(1)");
    expect(e.amount).toBe(7400);
  });

  it("survives a backslash-escape attempt", () => {
    const r = patchProgramLine("AZ", AZ_LINE, [change({ field: "label", after: 'a\\", live: false, z: "' })]);
    const e = evalEntry(r.patch);
    expect(e.live).toBe(true);
    expect(e.z).toBeUndefined();
  });

  it("caps runaway length", () => {
    const r = patchProgramLine("AZ", AZ_LINE, [change({ field: "label", after: "x".repeat(5000) })]);
    expect(r.patch.length).toBeLessThan(1500);
  });

  it("only ever touches whitelisted fields", () => {
    for (const f of ["rail", "requirements", "eligibility", "deadline", "other"] as const) {
      expect(isPatchable(f)).toBe(false);
    }
    for (const f of PATCHABLE) expect(isPatchable(f)).toBe(true);
  });
});

describe("proposalBody", () => {
  const base = {
    sourceLabel: "Arizona ESA",
    url: "https://www.azed.gov/esa",
    summary: "Award rises to $7,600",
    confidence: "high",
    magnitude: 0.14,
    model: "claude-sonnet-5",
  };

  it("leads with the claim, the evidence and the reviewer's warning", () => {
    const body = proposalBody({
      ...base,
      applied: [change({ field: "amount", before: "7400", after: "7600", quote: "awards are $7,600" })],
      manual: [],
    });
    expect(body).toContain("Award rises to $7,600");
    expect(body).toContain("awards are $7,600");
    expect(body).toContain("Read the source before merging");
    expect(body).toContain("untrusted input");
    // The verify flag must never look like it was cleared by a webpage.
    expect(body).toContain("only a real payment retires that flag");
  });

  it("calls out what the reviewer still has to do by hand", () => {
    const body = proposalBody({
      ...base,
      applied: [],
      manual: [{ change: change({ field: "rail", after: "odyssey" }), reason: "Never automated." }],
    });
    expect(body).toContain("Not automated");
    expect(body).toContain("rail");
  });

  it("neutralises pipes and newlines so a page cannot break the table", () => {
    const body = proposalBody({
      ...base,
      applied: [change({ field: "amount", before: "a|b", after: "c\n| evil | row |", quote: "q" })],
      manual: [],
    });
    const tableRows = body.split("\n").filter((l) => l.startsWith("| `amount`"));
    expect(tableRows).toHaveLength(1);
    expect(body).not.toContain("| evil | row |");
  });
});

describe("branchName", () => {
  it("is stable, scoped and filesystem-safe", () => {
    expect(branchName("az-esa", "cm123456789abcdef")).toBe("rules/az-esa-89abcdef");
    expect(branchName("Rail Class/Wallet", "abcdefghij")).toMatch(/^rules\/[a-z0-9-]+-cdefghij$/);
  });
});
