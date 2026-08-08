// Compliance-deadline classification. The stakes sentence for this module: a
// missed SLP submission has cost Florida families a year of funding, so the
// classifier's job is to make sure a recorded deadline can never quietly fall
// out of view — not even a malformed one.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyDeadlines, deadlinePhrase, DEADLINE_SOON_DAYS } from "@/lib/deadlines";
import { PROGRAMS } from "@/lib/rules";

const TODAY = "2026-08-08";
const d = (label: string, dueDate: string, completedAt: string | null = null) => ({
  label,
  dueDate,
  completedAt,
});

describe("classifyDeadlines", () => {
  it("splits into overdue, soon, later — and done stays out of all three", () => {
    const { overdue, soon, later, done } = classifyDeadlines(
      [
        d("quarterly report", "2026-08-01"), // 7 days past
        d("SLP submission", "2026-08-15"), // 7 days out — soon
        d("contract renewal", "2026-10-01"), // later
        d("old thing, handled", "2026-07-01", "2026-07-01T12:00:00Z"),
      ],
      TODAY
    );
    expect(overdue.map((x) => x.label)).toEqual(["quarterly report"]);
    expect(soon.map((x) => x.label)).toEqual(["SLP submission"]);
    expect(later.map((x) => x.label)).toEqual(["contract renewal"]);
    expect(done.map((x) => x.label)).toEqual(["old thing, handled"]);
  });

  it("holds the soon boundary exactly", () => {
    const at = new Date(Date.parse(TODAY + "T12:00:00") + DEADLINE_SOON_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const past = new Date(Date.parse(TODAY + "T12:00:00") + (DEADLINE_SOON_DAYS + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const { soon, later } = classifyDeadlines([d("at", at), d("past", past)], TODAY);
    expect(soon.map((x) => x.label)).toEqual(["at"]);
    expect(later.map((x) => x.label)).toEqual(["past"]);
  });

  it("due today is soon, not overdue — there is still time to act", () => {
    const { overdue, soon } = classifyDeadlines([d("today", TODAY)], TODAY);
    expect(overdue).toEqual([]);
    expect(soon[0].daysLeft).toBe(0);
  });

  it("a malformed date surfaces as overdue rather than vanishing", () => {
    // Overdue is the pile that gets looked at, which is where a typo gets
    // found. Disappearing is the one failure this module must never have.
    const { overdue } = classifyDeadlines([d("typo", "June 15th")], TODAY);
    expect(overdue.map((x) => x.label)).toEqual(["typo"]);
  });

  it("orders each bucket most-urgent first", () => {
    const { overdue, soon } = classifyDeadlines(
      [
        d("older", "2026-07-01"),
        d("newer", "2026-08-05"),
        d("nearer", "2026-08-10"),
        d("farther", "2026-08-20"),
      ],
      TODAY
    );
    expect(overdue.map((x) => x.label)).toEqual(["older", "newer"]);
    expect(soon.map((x) => x.label)).toEqual(["nearer", "farther"]);
  });
});

describe("deadlinePhrase", () => {
  it("reads like a person wrote it", () => {
    expect(deadlinePhrase(-4)).toBe("4 days overdue");
    expect(deadlinePhrase(-1)).toBe("1 day overdue");
    expect(deadlinePhrase(0)).toBe("Due today");
    expect(deadlinePhrase(1)).toBe("Due tomorrow");
    expect(deadlinePhrase(9)).toBe("Due in 9 days");
  });
});

describe("the obligation templates never carry a date", () => {
  // The one rule that keeps this feature honest: rules.ts may say WHICH
  // obligations a program carries, but the date comes from the school, off
  // their award letter or portal. A template with a hardcoded due date would
  // be an invented deadline shipped as fact — the exact failure the ⚑ system
  // exists to prevent.
  it("obligations have labels and hints, and hints carry the ⚑", () => {
    const all = Object.values(PROGRAMS).flatMap((p) => p.obligations ?? []);
    expect(all.length).toBeGreaterThanOrEqual(3); // AZ ×2 + FL ×1 today
    for (const o of all) {
      expect(o.label.length).toBeGreaterThan(3);
      expect(o.hint, o.key).toContain("⚑");
    }
  });

  it("no obligation smuggles a machine-usable date", () => {
    const all = Object.values(PROGRAMS).flatMap((p) => p.obligations ?? []);
    for (const o of all) {
      expect(JSON.stringify(o), o.key).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(o).not.toHaveProperty("dueDate");
    }
  });

  it("the iCal feed only shows deadlines to staff", () => {
    // A family's leaked calendar link must not disclose the school's reporting
    // obligations to its administrator — that is operator business.
    const route = readFileSync(
      join(process.cwd(), "src/app/calendar/[token]/route.ts"),
      "utf8"
    );
    const gate = route.indexOf("if (staff) {");
    const query = route.indexOf("prisma.complianceDeadline.findMany");
    expect(gate).toBeGreaterThan(-1);
    expect(query).toBeGreaterThan(gate);
    // ...and inside that block: the next closing of the block comes after it.
    expect(route.slice(gate, query)).not.toContain("\n  }\n");
  });

  it("the deadline model stores what the school typed, not what we guessed", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const model = schema.slice(
      schema.indexOf("model ComplianceDeadline"),
      schema.indexOf("}", schema.indexOf("model ComplianceDeadline"))
    );
    expect(model).toContain("dueDate");
    expect(model).not.toMatch(/@default\("[0-9]{4}/); // no default date, ever
  });
});
