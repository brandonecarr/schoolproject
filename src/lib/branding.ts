// School identity on the documents that leave the building.
//
// A reimbursement packet is read by a state reviewer who has never heard of us.
// It should arrive on the SCHOOL's letterhead: a packet headed "Cohort" reads
// as though a software company is making the claim, when the school is the one
// attesting to it — and an attestation is only as good as the name at the top.
// Cohort belongs in the footer, as the system of record the school used.
//
// TWO REASONS THE ACCENT COLOUR IS NEVER USED RAW.
//
//   1. Injection. It is interpolated into generated HTML inside a <style>
//      block, where the usual escaping does nothing: a value of
//      `red;} body{display:none} .x{` needs no angle brackets to wreck the
//      document, and `url(...)` in a stylesheet is a live network reference.
//      So this module does not escape the colour, it REFUSES anything that
//      isn't a hex triple. Allow-list, not sanitise.
//
//   2. Contrast. 8.1 spent real effort getting this app to AA. A school that
//      picks a pale yellow must not be able to undo that with white text on
//      top, so the foreground is computed against the chosen colour rather
//      than assumed, using the same maths as the palette audit.
//
// Pure: no Prisma, no I/O.

import { contrastRatio, AA_NORMAL } from "@/lib/contrast";

/** The house colour, used whenever a school hasn't chosen one. */
export const DEFAULT_ACCENT = "#1F3A6E";

/**
 * Accept a hex colour, or return null.
 *
 * Deliberately strict — 3- and 6-digit hex only, normalised to 6-digit
 * lowercase. No named colours, no rgb(), no hsl(): every one of those widens
 * what may appear inside a stylesheet, and none of them buys a school anything
 * a hex code doesn't.
 */
export function parseAccent(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(raw);
  if (!m) return null;
  const hex = m[1].toLowerCase();
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  return `#${full}`;
}

/** The school's accent, or the house default when unset or unparseable. */
export function accentOf(school: { accentColor?: string | null } | null | undefined): string {
  return parseAccent(school?.accentColor) ?? DEFAULT_ACCENT;
}

/**
 * The BEST available text colour on `bg` — not necessarily a passing one.
 *
 * Picks whichever of near-black / white has the higher ratio. For most colours
 * that clears AA comfortably, but mid-greys around #808080 top out near 4.3:1
 * against both, so no choice reaches 4.5. This function still answers (there
 * has to be something to render); `accentIsLegible` is what reports the
 * shortfall, and the settings UI warns on it rather than failing silently.
 */
export function readableOn(bg: string): string {
  const hex = parseAccent(bg) ?? DEFAULT_ACCENT;
  const dark = "#141c26";
  const light = "#ffffff";
  return contrastRatio(dark, hex) >= contrastRatio(light, hex) ? dark : light;
}

/** Whether a colour can carry normal-size text at AA in either direction. */
export function accentIsLegible(bg: string): boolean {
  const hex = parseAccent(bg);
  if (!hex) return false;
  return contrastRatio(readableOn(hex), hex) >= AA_NORMAL;
}

import { packetProviderLine } from "@/lib/provider";

export type Brand = {
  schoolName: string;
  address: string;
  /** "ClassWallet provider ID: 90210", or "" when the school has recorded none.
   *  Sits under the address on the letterhead because that is where a reviewer
   *  looks to match a claim to their approved-provider list. Built by
   *  packetProviderLine in lib/provider.ts; a claim the school made, which is
   *  exactly what a provider ID on an invoice has always been. */
  providerLine: string;
  /** The school's colour. Safe for RULES AND EDGES at any value — a border
   *  carries no text, so contrast never applies to it. */
  accent: string;
  /** Best foreground for `accent`. Only meaningful where `accent` is used as a
   *  fill, which is `surface` below rather than `accent` itself. */
  onAccent: string;
  /** The colour to FILL a surface with — a button bar, a banner, anything that
   *  will have text on top.
   *
   *  Identical to `accent` whenever the accent can carry text. When it can't
   *  (mid-greys clear no more than ~4.3:1 against either black or white), this
   *  falls back to the house colour rather than shipping text below AA. 8.1
   *  spent real effort getting this app to AA, and a colour picker is not a
   *  good enough reason to hand it back. */
  surface: string;
  /** Readable foreground for `surface`. Always meets AA. */
  onSurface: string;
  /** data: URI for the logo, or null. Inlined rather than linked so a saved
   *  PDF or a forwarded HTML file still shows the logo with no session and no
   *  network — the whole point of the artifact is that it travels. */
  logo: string | null;
};

export function brandOf(
  school:
    | {
        name: string;
        address?: string | null;
        accentColor?: string | null;
        providerId?: string | null;
        providerRail?: string | null;
      }
    | null
    | undefined,
  logo: { mime: string; data: Uint8Array } | null
): Brand {
  const accent = accentOf(school);
  const surface = accentIsLegible(accent) ? accent : DEFAULT_ACCENT;
  return {
    schoolName: school?.name ?? "",
    address: school?.address ?? "",
    providerLine: packetProviderLine({
      providerId: school?.providerId ?? "",
      providerRail: school?.providerRail ?? "",
      providerAttestedAt: null,
    }),
    accent,
    onAccent: readableOn(accent),
    surface,
    onSurface: readableOn(surface),
    logo: logo ? logoDataUri(logo) : null,
  };
}

/** Only raster types a browser will render inline. SVG is excluded on purpose:
 *  an SVG is a document that can carry script, and this one gets embedded in a
 *  page we generate. */
const LOGO_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export function logoDataUri(file: { mime: string; data: Uint8Array }): string | null {
  if (!LOGO_MIME.has(file.mime)) return null;
  const b64 = Buffer.from(file.data).toString("base64");
  return `data:${file.mime};base64,${b64}`;
}
