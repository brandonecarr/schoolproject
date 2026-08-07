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

export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(hexToRgb(fgHex));
  const l2 = relativeLuminance(hexToRgb(bgHex));
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

export const TOKENS = {
  ground: "#f2f3ef",
  card: "#ffffff",
  ink: "#141c26",
  inkSoft: "#5c6672",
  rule: "#dcdfd8",
  blue: "#1f3a6e",
  blueSoft: "#e4e9f2",
  mark: "#c8e64b",
  markDeep: "#6b7d18",
  good: "#16705f",
  goodSoft: "#e2f0ec",
  warn: "#7a5209",
  warnSoft: "#f7eedc",
  bad: "#9b3223",
  badSoft: "#f6e4e1",
} as const;

/** Foreground/background combinations the app renders, with where they appear.
 *  `large` marks text at 18pt+ or bold 14pt+, which AA scores at 3:1. */
export const PAIRS: { name: string; fg: keyof typeof TOKENS; bg: keyof typeof TOKENS; large?: boolean }[] = [
  { name: "body text on page", fg: "ink", bg: "ground" },
  { name: "body text on card", fg: "ink", bg: "card" },
  { name: "muted text on page", fg: "inkSoft", bg: "ground" },
  { name: "muted text on card", fg: "inkSoft", bg: "card" },
  { name: "link/heading blue on page", fg: "blue", bg: "ground" },
  { name: "link/heading blue on card", fg: "blue", bg: "card" },
  { name: "blue pill", fg: "blue", bg: "blueSoft" },
  { name: "good pill", fg: "good", bg: "goodSoft" },
  { name: "warn pill", fg: "warn", bg: "warnSoft" },
  { name: "bad pill", fg: "bad", bg: "badSoft" },
  { name: "good notice on page", fg: "good", bg: "ground" },
  { name: "warn notice on page", fg: "warn", bg: "ground" },
  { name: "bad notice on page", fg: "bad", bg: "ground" },
  // The highlighter is a background, never a text colour — ink sits on it.
  { name: "ink on highlighter", fg: "ink", bg: "mark" },
  { name: "deep highlighter on card", fg: "markDeep", bg: "card" },
];

export type PairResult = { name: string; ratio: number; required: number; passes: boolean };

export function auditPalette(): PairResult[] {
  return PAIRS.map((p) => {
    const ratio = Number(contrastRatio(TOKENS[p.fg], TOKENS[p.bg]).toFixed(2));
    const required = p.large ? AA_LARGE : AA_NORMAL;
    return { name: p.name, ratio, required, passes: ratio >= required };
  });
}
