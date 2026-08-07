// The four faces the redesign uses, self-hosted via next/font.
//
// next/font rather than the CDN <link> the prototype used: it downloads the
// files at build time and serves them from our own origin, which removes a
// third-party request on every page load and — the part that matters here —
// eliminates the flash of fallback text that would otherwise hit every screen,
// since these faces carry the role identity.
//
// Two families per style set. Soft (teacher, parent) is Plus Jakarta Sans
// throughout. Ledger (student) pairs Space Grotesk headings with IBM Plex Sans
// body and IBM Plex Mono numerals — the monospace figures are most of why the
// student portal reads as a different surface.

import { Plus_Jakarta_Sans, Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--f-jakarta",
  display: "swap",
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--f-grotesk",
  display: "swap",
});

export const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--f-plex",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--f-plex-mono",
  display: "swap",
});

/** Every font variable, for the <html> class. */
export const fontVars = [jakarta.variable, spaceGrotesk.variable, plexSans.variable, plexMono.variable].join(" ");
