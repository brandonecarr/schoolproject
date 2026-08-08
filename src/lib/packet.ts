// The letterhead and chrome shared by every document that leaves the building.
//
// Five print routes each carried their own near-identical copy of this CSS,
// which is how the invoice packet and the student record drifted into slightly
// different type scales. One definition, and a school's identity reaches all of
// them at once — including any print route added later, which is the part that
// matters: the next one gets the letterhead for free rather than by remembering.
//
// The accent is interpolated straight into a <style> block. That is only safe
// because Brand.accent comes from parseAccent(), which allow-lists hex triples
// rather than escaping — see lib/branding.ts.
//
// Pure: no Prisma. Loading a school's brand lives in lib/packet-read.ts, so
// these helpers stay unit-testable without a database (same split as
// portfolio.ts / portfolio-read.ts).

import { brandOf, type Brand } from "@/lib/branding";

export { type Brand };
export { brandOf };

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Just the letterhead rules.
 *
 * Split out because the portfolio print is a different kind of document — no
 * action bar, its own type scale — but should still carry the school's mark.
 *
 * The school's name sits above the document title, the way a letter from an
 * institution does: a reader should know who is attesting before they read
 * what is attested.
 */
export function letterheadCss(brand: Brand): string {
  return `
  .letterhead{display:flex;align-items:center;gap:14px;border-bottom:3px solid ${brand.accent};padding-bottom:10px;margin-bottom:18px}
  .letterhead img{height:46px;width:auto;max-width:190px;object-fit:contain}
  .letterhead .name{font-family:ui-serif,Georgia,serif;font-size:15pt;line-height:1.25;color:#141C26}
  .letterhead .addr{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:9pt;color:#5C6672}
  .letterhead .prov{margin-top:2px;font-variant-numeric:tabular-nums}`;
}

/**
 * Base stylesheet for a printed document.
 *
 * Serif body on purpose: these are read as records, often on paper, and the
 * schoolbook-ledger identity is the one part of the app that should survive
 * being printed in black and white.
 */
export function packetCss(brand: Brand): string {
  return `
  *{box-sizing:border-box}
  body{margin:0;padding:44px;font-family:ui-serif,Georgia,"Times New Roman",serif;color:#141C26;font-size:12pt;line-height:1.55;background:#fff;max-width:840px}
  h1{font-size:20pt;margin:0 0 2px}
  h2{font-size:11pt;text-transform:uppercase;letter-spacing:.14em;margin:26px 0 8px;color:#5C6672;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  th{text-align:left;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:8.5pt;letter-spacing:.1em;text-transform:uppercase;color:#5C6672;padding:0 8px 6px;border-bottom:1px solid #DCDFD8}
  td{padding:7px 8px;border-bottom:1px solid #EDEFE9;font-size:11pt}
  .narrative{border-left:3px solid ${brand.accent};padding:2px 0 2px 16px;margin:6px 0 0}
  .sub{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:9.5pt;color:#5C6672}
  .num{text-align:right}

  ${letterheadCss(brand)}
  .head{border-bottom:1px solid #DCDFD8;padding-bottom:14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
  .meta{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:10pt;color:#5C6672;text-align:right;line-height:1.7}
  .foot{margin-top:32px;padding-top:12px;border-top:1px solid #DCDFD8;font-family:-apple-system,sans-serif;font-size:8.5pt;color:#5C6672}

  /* On-screen action bar; never printed. Filled with brand.surface rather than
     brand.accent: this one carries text, and an accent that cannot reach AA
     falls back to the house colour instead of shipping unreadable chrome. */
  .bar{position:fixed;top:0;left:0;right:0;background:${brand.surface};color:${brand.onSurface};padding:10px 18px;font-family:-apple-system,sans-serif;font-size:13px;display:flex;gap:14px;align-items:center;justify-content:space-between;z-index:9}
  .bar button,.bar a{font:inherit;padding:6px 14px;border-radius:7px;border:0;cursor:pointer;text-decoration:none}
  .bar button{background:#C8E64B;color:#2F3908;font-weight:700}
  .bar a{background:rgba(127,127,127,.25);color:${brand.onSurface}}
  body{padding-top:96px}
  @media print{.bar{display:none}body{padding:0}@page{margin:18mm}}
  `;
}

/**
 * The school's letterhead.
 *
 * Renders nothing when a school has no name, rather than an empty rule — a
 * blank band at the top of a reviewed document looks like a rendering fault.
 */
export function letterhead(brand: Brand): string {
  if (!brand.schoolName) return "";
  const logo = brand.logo
    ? `<img src="${brand.logo}" alt="${esc(brand.schoolName)} logo">`
    : "";
  return `<div class="letterhead">${logo}<div>
    <div class="name">${esc(brand.schoolName)}</div>
    ${brand.address ? `<div class="addr">${esc(brand.address)}</div>` : ""}
    ${brand.providerLine ? `<div class="addr prov">${esc(brand.providerLine)}</div>` : ""}
  </div></div>`;
}

/**
 * The receipts section of a packet: the itemised proof of purchase a reviewer
 * matches against the amount claimed. Arizona's rail lists "itemised receipts"
 * as a requirement by name; our packets carried none until this existed.
 *
 * Same figure grid as the work samples, deliberately — a reviewer flipping
 * through the packet reads both kinds of image evidence the same way. Images
 * render inline through /files/<id> (the print page is served authenticated,
 * so the file route's access control still applies); PDFs get a placeholder
 * card naming the file, since a print engine cannot inline them.
 *
 * Returns "" when there are none: a packet must never carry an empty
 * "Receipts" heading implying documents were withheld.
 */
export function receiptFigures(
  receipts: { id: string; label: string; mime: string }[]
): string {
  if (receipts.length === 0) return "";
  const figs = receipts
    .map((f) =>
      f.mime === "application/pdf"
        ? `<figure><div style="border:1px solid #DCDFD8;border-radius:4px;padding:24px;text-align:center;font-family:sans-serif;font-size:9pt;color:#5C6672">PDF attachment</div><figcaption>${esc(f.label)}</figcaption></figure>`
        : `<figure><img src="/files/${esc(f.id)}" alt="${esc(f.label)}"><figcaption>${esc(f.label)}</figcaption></figure>`
    )
    .join("");
  return `<h2>Receipts (${receipts.length})</h2><div class="samples">${figs}</div>`;
}

/**
 * The footer, where Cohort belongs.
 *
 * `provenance` is the document's own sentence about where its contents came
 * from — that claim is what a reviewer weighs, so each route still writes its
 * own. This only adds the attribution line beneath it.
 */
export function packetFoot(provenance: string): string {
  return `<div class="foot">${provenance}
  <div style="margin-top:6px;opacity:.75">Records kept in Cohort.</div></div>`;
}

/** The on-screen print bar. Hidden by @media print. */
export function printBar(message: string, backHref: string): string {
  return `<div class="bar">
    <span>${esc(message)}</span>
    <span><a href="${esc(backHref)}">Back</a> <button onclick="window.print()">Print / Save as PDF</button></span>
  </div>`;
}
