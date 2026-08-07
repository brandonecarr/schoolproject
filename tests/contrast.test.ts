import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  contrastRatio,
  meetsAA,
  auditPalette,
  oklchToRgb,
  parseColor,
  TOKENS,
  PAIRS,
  ROLE_ACCENTS,
  AA_NORMAL,
  type Role,
} from "@/lib/contrast";

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

  /** Read a custom property's value from a given selector block. */
  const cssVar = (selector: string, name: string): string | null => {
    const block = new RegExp(`${selector.replace(/[[\]"=]/g, "\\$&")}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
    if (!block) return null;
    const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block[1]);
    return m ? m[1].trim() : null;
  };

  const rootMap: [keyof typeof TOKENS, string][] = [
    ["surface", "surface"],
    ["bg", "bg"],
    ["ink", "ink"],
    ["ink2", "ink2"],
    ["ink3", "ink3"],
    ["line", "line"],
    ["good", "good"],
    ["warn", "warn"],
    ["bad", "bad"],
    ["goodS", "good-s"],
    ["warnS", "warn-s"],
    ["badS", "bad-s"],
    ["sideBg", "side-bg"],
    ["sideInk", "side-ink"],
    ["sideDim", "side-dim"],
  ];

  it.each(rootMap)("%s matches the stylesheet", (key, cssName) => {
    expect(cssVar(":root", cssName)).toBe(TOKENS[key]);
  });

  it.each(["parent", "student"] as const)("%s accent ramp matches the stylesheet", (role) => {
    const sel = `[data-role="${role}"]`;
    expect(cssVar(sel, "accent")).toBe(ROLE_ACCENTS[role].accent);
    expect(cssVar(sel, "accent-dark")).toBe(ROLE_ACCENTS[role].accentDark);
    expect(cssVar(sel, "accent-soft")).toBe(ROLE_ACCENTS[role].accentSoft);
  });

  it("teacher accent ramp matches :root", () => {
    expect(cssVar(":root", "accent")).toBe(ROLE_ACCENTS.teacher.accent);
    expect(cssVar(":root", "accent-dark")).toBe(ROLE_ACCENTS.teacher.accentDark);
    expect(cssVar(":root", "accent-soft")).toBe(ROLE_ACCENTS.teacher.accentSoft);
  });
});

describe("every role accent is usable", () => {
  const roles = Object.keys(ROLE_ACCENTS) as Role[];

  it.each(roles)("%s: accent-dark is readable as text on white", (role) => {
    // The handoff's rule: accent-dark for text, accent for fills. Enforced
    // here so a future hue change can't quietly break accent-coloured labels.
    expect(contrastRatio(ROLE_ACCENTS[role].accentDark, TOKENS.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(roles)("%s: white is readable on an accent fill", (role) => {
    expect(contrastRatio("#ffffff", ROLE_ACCENTS[role].accent)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(roles)("%s: accent-dark is readable on its own soft tint", (role) => {
    expect(contrastRatio(ROLE_ACCENTS[role].accentDark, ROLE_ACCENTS[role].accentSoft)).toBeGreaterThanOrEqual(
      AA_NORMAL
    );
  });

  it("keeps the three accents in one perceptual band", () => {
    // This is what makes them read as siblings rather than three unrelated
    // brand colours — only hue should move between roles.
    const parse = (s: string) => {
      const m = /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/.exec(s)!;
      return { l: Number(m[1]), c: Number(m[2]) };
    };
    const ls = roles.map((r) => parse(ROLE_ACCENTS[r].accent).l);
    expect(Math.max(...ls) - Math.min(...ls)).toBeLessThanOrEqual(0.05);
  });
});

describe("OKLCH conversion", () => {
  it("reproduces the sRGB primaries exactly", () => {
    // The real check. These four OKLCH coordinates have exactly known sRGB
    // values, so hitting them to the byte proves the whole pipeline —
    // OKLab transform, LMS cube, matrix, and gamma encode.
    //
    // An earlier version of this test compared against the handoff's ≈hex
    // column instead and failed by 14/255 on one channel. The converter was
    // right and the table was loose — which is what the handoff says about it
    // ("approximations… do not round-trip through them"). Asserting against an
    // approximation is precisely the testing-fiction this file exists to stop.
    expect(oklchToRgb(1, 0, 0)).toEqual({ r: 255, g: 255, b: 255 });
    expect(oklchToRgb(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0 });
    expect(oklchToRgb(0.628, 0.2577, 29.23)).toEqual({ r: 255, g: 0, b: 0 });
    expect(oklchToRgb(0.8664, 0.2948, 142.5)).toEqual({ r: 0, g: 255, b: 0 });
    expect(oklchToRgb(0.452, 0.3132, 264.05)).toEqual({ r: 0, g: 0, b: 255 });
    expect(oklchToRgb(0.5999, 0, 0)).toEqual({ r: 128, g: 128, b: 128 });
  });

  it("lands in the right neighbourhood of the handoff's hex column", () => {
    // Loose on purpose — the table is an approximation. This catches a hue or
    // lightness typo, not a rounding difference.
    const near = (a: number, b: number) => Math.abs(a - b) <= 26;
    const t = oklchToRgb(0.55, 0.19, 285);
    expect(near(t.r, 0x6b) && near(t.g, 0x4a) && near(t.b, 0xd6)).toBe(true);
    const p = oklchToRgb(0.52, 0.11, 185);
    expect(near(p.r, 0x16) && near(p.g, 0x80) && near(p.b, 0x7c)).toBe(true);
  });

  it("clamps out-of-gamut colours instead of returning nonsense", () => {
    const c = oklchToRgb(0.6, 0.5, 150);
    for (const v of [c.r, c.g, c.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it("reads oklch and hex through the same door", () => {
    expect(parseColor("#ffffff")).toEqual(parseColor("oklch(1 0 0)"));
  });
});
