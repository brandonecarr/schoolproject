import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, meetsAA, auditPalette, TOKENS, PAIRS } from "@/lib/contrast";

// Colour contrast as a failing test rather than something a user discovers.
// axe caught `--warn` on `--warn-soft` at 3.61:1 and `--mark-deep` on white at
// 2.77:1 — a status badge and an accent, both in parts of the UI whose whole
// job is being noticed.

describe("contrastRatio", () => {
  it("matches the known extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is symmetric — order of foreground and background doesn't matter", () => {
    expect(contrastRatio("#1f3a6e", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#1f3a6e"), 6);
  });

  it("handles shorthand hex", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 1);
  });

  it("scores the two colours that actually failed", () => {
    // Regression anchors: these are the values that shipped broken.
    expect(contrastRatio("#a8710f", "#f7eedc")).toBeLessThan(4.5);
    expect(contrastRatio("#8fa524", "#ffffff")).toBeLessThan(4.5);
  });
});

describe("meetsAA", () => {
  it("applies the right threshold for normal and large text", () => {
    // ~3.6:1 — fails as body text, passes as large.
    expect(meetsAA("#a8710f", "#f7eedc")).toBe(false);
    expect(meetsAA("#a8710f", "#f7eedc", true)).toBe(true);
  });
});

describe("the shipped palette", () => {
  const results = auditPalette();

  it.each(results.map((r) => [r.name, r] as const))("%s meets AA", (_name, r) => {
    expect(r.ratio, `${r.ratio}:1, needs ${r.required}:1`).toBeGreaterThanOrEqual(r.required);
  });

  it("covers every pair without gaps", () => {
    expect(results).toHaveLength(PAIRS.length);
    expect(results.every((r) => r.ratio > 0)).toBe(true);
  });
});

describe("the tokens here match globals.css", () => {
  // The palette above is a copy, and a copy drifts. This reads the real
  // stylesheet so a colour changed in CSS without changing the test fails
  // loudly rather than leaving the audit quietly testing fiction.
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const cssVar = (name: string): string | null => {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
    return m ? m[1].toLowerCase() : null;
  };

  const map: [keyof typeof TOKENS, string][] = [
    ["ground", "ground"],
    ["card", "card"],
    ["ink", "ink"],
    ["inkSoft", "ink-soft"],
    ["rule", "rule"],
    ["blue", "blue"],
    ["blueSoft", "blue-soft"],
    ["mark", "mark"],
    ["markDeep", "mark-deep"],
    ["good", "good"],
    ["goodSoft", "good-soft"],
    ["warn", "warn"],
    ["warnSoft", "warn-soft"],
    ["bad", "bad"],
    ["badSoft", "bad-soft"],
  ];

  it.each(map)("--%s matches", (token, cssName) => {
    expect(cssVar(cssName)).toBe(TOKENS[token].toLowerCase());
  });
});
