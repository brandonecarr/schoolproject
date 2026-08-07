import { describe, it, expect } from "vitest";
import { PROGRAMS, RAILS, railForState, programOptions } from "@/lib/rules";
import { SOURCES } from "@/lib/sources";

// These guard the integrity of the funding table, not the accuracy of it.
// Accuracy is a Phase 0 interview problem — see the ⚑ note in src/lib/rules.ts.

describe("PROGRAMS ↔ RAILS integrity", () => {
  it("every program points at a rail that exists", () => {
    for (const [state, p] of Object.entries(PROGRAMS)) {
      expect(RAILS[p.rail], `${state} → unknown rail "${p.rail}"`).toBeDefined();
    }
  });

  it("every rail is reachable from at least one program", () => {
    const used = new Set(Object.values(PROGRAMS).map((p) => p.rail));
    for (const id of Object.keys(RAILS)) {
      expect(used.has(id), `rail "${id}" has no programs`).toBe(true);
    }
  });

  it("rail.states is derived from PROGRAMS, so the two cannot drift", () => {
    for (const [state, p] of Object.entries(PROGRAMS)) {
      expect(RAILS[p.rail].states).toContain(state);
    }
    const total = Object.values(RAILS).reduce((n, r) => n + r.states.length, 0);
    expect(total).toBe(Object.keys(PROGRAMS).length);
  });

  it("keys are two-letter state codes — Student.esaProgram stores this verbatim", () => {
    for (const key of Object.keys(PROGRAMS)) expect(key).toMatch(/^[A-Z]{2}$/);
  });
});

describe("program metadata", () => {
  it("stays flagged for verification until a real invoice cycle is observed", () => {
    // Dropping this assertion is the point of failure the header warns about:
    // an unflagged rule reads as fact, and a school bills against it.
    for (const [id, r] of Object.entries(RAILS)) {
      expect(r.verify, `rail "${id}" is no longer flagged`).toBe(true);
    }
  });

  it("carries a plausible award amount for the invoice form's default", () => {
    for (const [state, p] of Object.entries(PROGRAMS)) {
      expect(p.amount, `${state} amount`).toBeGreaterThan(0);
      expect(p.amount, `${state} amount`).toBeLessThan(100_000);
    }
  });

  it("carries an explicit live flag on every program", () => {
    // `live: false` means enacted but not yet disbursing — selectable so a
    // school can plan, but it must not be invoiced against. Asserted
    // structurally rather than by naming a program: every entry is currently
    // live (Texas started funding in 2026), and an assertion pinned to one
    // state silently stops testing anything the moment that state flips.
    for (const [state, p] of Object.entries(PROGRAMS)) {
      expect(typeof p.live, `${state} live`).toBe("boolean");
      expect(["esa", "taxcredit", "voucher", "allotment"]).toContain(p.kind);
    }
  });
});

describe("SOURCES ↔ PROGRAMS coherence", () => {
  it("watches every program we let a school select", () => {
    // A program in the dropdown with no source is a rule we would never notice
    // changing — the exact gap this watcher exists to close.
    const watched = new Set(SOURCES.filter((s) => s.programCode).map((s) => s.programCode));
    for (const state of Object.keys(PROGRAMS)) {
      expect(watched.has(state), `${state} has no watch source`).toBe(true);
    }
  });

  it("watches every rail", () => {
    const watched = new Set(SOURCES.filter((s) => s.railId).map((s) => s.railId));
    for (const id of Object.keys(RAILS)) {
      // statedirect is not a vendor — there is no single page to watch for it.
      if (id === "statedirect") continue;
      expect(watched.has(id), `rail ${id} has no watch source`).toBe(true);
    }
  });

  it("never points a source at a program or rail that does not exist", () => {
    for (const s of SOURCES) {
      if (s.programCode) expect(PROGRAMS[s.programCode], `${s.id} → ${s.programCode}`).toBeDefined();
      if (s.railId) expect(RAILS[s.railId], `${s.id} → ${s.railId}`).toBeDefined();
    }
  });

  it("uses unique ids — the id is the database key, so a collision merges histories", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses https everywhere — these feed decisions about real money", () => {
    for (const s of SOURCES) expect(s.url.startsWith("https://"), `${s.id}: ${s.url}`).toBe(true);
  });
});

describe("railForState", () => {
  it("resolves a school's rail from its state", () => {
    expect(railForState("AZ")?.id).toBe("classwallet");
    expect(railForState("UT")?.id).toBe("ace");
    expect(railForState("TN")?.id).toBe("studentfirst");
  });

  it("returns null for a state with no program rather than throwing", () => {
    expect(railForState("CA")).toBeNull();
    expect(railForState("")).toBeNull();
  });
});

describe("programOptions", () => {
  it("returns every program, alphabetical by label, with its code attached", () => {
    const opts = programOptions();
    expect(opts).toHaveLength(Object.keys(PROGRAMS).length);
    const labels = opts.map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(opts.find((o) => o.code === "AZ")?.label).toBe("Arizona ESA");
  });
});
