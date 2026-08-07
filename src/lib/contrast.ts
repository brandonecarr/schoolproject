// WCAG contrast maths, and the palette pairs the app actually renders.
//
// This exists so colour contrast is a failing test rather than something
// discovered by a user who can't read the "needs attention" pill. axe found
// `--warn` on `--warn-soft` at 3.61:1 against a required 4.5:1 — a status
// badge, in the one part of the UI whose entire job is being noticed.
//
// The pairs are listed by hand below because only the app knows which colours
// meet: a stylesheet parser would either miss combinations built at runtime or
// invent ones that never appear together.

export type Rgb = { r: number; g: number; b: number };

/**
 * OKLCH → sRGB.
 *
 * The palette is authored in OKLCH and that is the source of truth: it is what
 * holds the three role accents at equal perceptual lightness while only hue
 * moves. Converting here — rather than auditing a table of hand-written hex
 * approximations — means this file measures the colours the browser actually
 * paints. An approximation that drifts by a percent is exactly how an audit
 * ends up certifying something the user never sees.
 *
 * Standard pipeline: OKLCH → OKLab → LMS → linear sRGB → gamma-encoded sRGB,
 * with the matrices from Björn Ottosson's original definition. Out-of-gamut
 * values are clamped, which is what a browser does too.
 */
export function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const bb = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = l - 0.0894841775 * a - 1.291485548 * bb;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  const lr = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const lg = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const lb = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  const enc = (v: number) => {
    const x = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(x * 255)));
  };
  return { r: enc(lr), g: enc(lg), b: enc(lb) };
}

/** Parse either `#rrggbb` or `oklch(L C H)` (with an optional `/ alpha`,
 *  which is ignored — contrast is only meaningful on opaque colours). */
export function parseColor(value: string): Rgb {
  const v = String(value ?? "").trim();
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(v);
  if (m) return oklchToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
  return hexToRgb(v);
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** WCAG 2.x relative luminance. The 0.03928 branch and the 2.4 exponent are
 *  from the spec — this is not a perceptual model, it's the legal one. */
export function relativeLuminance(c: Rgb): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(parseColor(fg));
  const l2 = relativeLuminance(parseColor(bg));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA needs 4.5:1 for body text, 3:1 for large text (18pt, or 14pt bold). */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

export function meetsAA(fg: string, bg: string, large = false): boolean {
  // Rounded to 2dp first: a ratio of 4.4996 displays as 4.5 in every tool a
  // reviewer would check with, and failing on the third decimal is noise.
  return Number(contrastRatio(fg, bg).toFixed(2)) >= (large ? AA_LARGE : AA_NORMAL);
}

// --- The palette, as it exists in globals.css -------------------------------
//
// Authored in OKLCH, and measured in OKLCH — parseColor converts, so this audits
// the colours the browser paints rather than a hand-written hex approximation
// that drifts. Three role accents share a lightness and chroma band; only hue
// moves, so each role is audited separately.

export const TOKENS = {
  surface: "#ffffff",
  surface2: "oklch(0.985 0.006 285)",
  bg: "oklch(0.968 0.012 290)",
  ink: "oklch(0.22 0.03 285)",
  ink2: "oklch(0.46 0.02 285)",
  ink3: "oklch(0.56 0.015 285)",
  line: "oklch(0.92 0.012 285)",
  good: "oklch(0.51 0.14 155)",
  warn: "oklch(0.51 0.15 72)",
  bad: "oklch(0.51 0.19 25)",
  goodS: "oklch(0.95 0.04 155)",
  warnS: "oklch(0.95 0.05 72)",
  badS: "oklch(0.95 0.04 25)",
  sideBg: "oklch(0.22 0.035 275)",
  sideInk: "oklch(0.99 0 0)",
  sideDim: "oklch(0.72 0.02 275)",
} as const;

/** Per-role accent ramps. accent is fill-only; accentDark is the text colour. */
export const ROLE_ACCENTS = {
  teacher: { accent: "oklch(0.55 0.19 285)", accentDark: "oklch(0.45 0.19 285)", accentSoft: "oklch(0.955 0.03 285)" },
  parent: { accent: "oklch(0.52 0.11 185)", accentDark: "oklch(0.42 0.11 185)", accentSoft: "oklch(0.958 0.022 185)" },
  student: { accent: "oklch(0.56 0.16 42)", accentDark: "oklch(0.46 0.16 42)", accentSoft: "oklch(0.962 0.028 60)" },
} as const;

export type Role = keyof typeof ROLE_ACCENTS;

/** Foreground/background combinations the app renders, with where they appear.
 *  `large` marks text at 18pt+ or bold 14pt+, which AA scores at 3:1. */
export const PAIRS: { name: string; fg: keyof typeof TOKENS; bg: keyof typeof TOKENS; large?: boolean }[] = [
  { name: "body text on card", fg: "ink", bg: "surface" },
  { name: "body text on page", fg: "ink", bg: "bg" },
  { name: "secondary text on card", fg: "ink2", bg: "surface" },
  { name: "secondary text on page", fg: "ink2", bg: "bg" },
  // ink3 carries eyebrows and meta at 11-12.5px. Small text is exactly where a
  // near-miss hurts, so it is audited at the normal 4.5:1 threshold.
  { name: "meta text on card", fg: "ink3", bg: "surface" },
  { name: "meta text on inset", fg: "ink3", bg: "surface2" },
  { name: "good pill", fg: "good", bg: "goodS" },
  { name: "warn pill", fg: "warn", bg: "warnS" },
  { name: "bad pill", fg: "bad", bg: "badS" },
  { name: "good text on card", fg: "good", bg: "surface" },
  { name: "warn text on card", fg: "warn", bg: "surface" },
  { name: "bad text on card", fg: "bad", bg: "surface" },
  { name: "white on good fill", fg: "surface", bg: "good" },
  { name: "white on bad fill", fg: "surface", bg: "bad" },
  { name: "teacher sidebar label", fg: "sideInk", bg: "sideBg" },
  { name: "teacher sidebar dim label", fg: "sideDim", bg: "sideBg" },
];

export type PairResult = { name: string; ratio: number; required: number; passes: boolean };

export function auditPalette(): PairResult[] {
  return PAIRS.map((p) => {
    const ratio = Number(contrastRatio(TOKENS[p.fg], TOKENS[p.bg]).toFixed(2));
    const required = p.large ? AA_LARGE : AA_NORMAL;
    return { name: p.name, ratio, required, passes: ratio >= required };
  });
}
