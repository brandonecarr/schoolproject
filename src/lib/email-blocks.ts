// The email builder's block model and its two renderers — pure functions,
// shared verbatim by the client (live preview) and the server (the actual
// send), so what the teacher sees is what the parent gets.
//
// SAFETY RULES, because these emails leave the building under the school's
// name: every string is HTML-escaped (there is deliberately NO raw-HTML
// block), URLs must be http(s) or the block is neutralized, and the block
// list is parsed against this schema — a crafted payload degrades to fewer
// blocks, never to markup injection. Notifications stay text-only (see
// lib/email.ts renderEmail); this HTML path exists only for announcements a
// teacher composed on purpose.

/** Left is the default and is stored as ABSENCE of the field — a block only
 *  carries `align` when it deviates, so old stored blasts parse unchanged. */
export type Align = "center" | "right";

export type EmailBlock =
  | { kind: "heading"; text: string; align?: Align }
  | { kind: "text"; text: string; align?: Align }
  | { kind: "button"; label: string; url: string; align?: Align }
  | { kind: "image"; url: string; alt: string; align?: Align }
  | { kind: "divider" }
  | { kind: "spacer" };

export const MAX_BLOCKS = 30;

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) return null;
  if (url.length > 2000) return null;
  return url;
}

/** Parse untrusted JSON into a valid block list. Bad blocks drop silently. */
export function parseBlocks(json: string): EmailBlock[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: EmailBlock[] = [];
  for (const b of raw.slice(0, MAX_BLOCKS)) {
    if (typeof b !== "object" || b === null) continue;
    const kind = (b as { kind?: unknown }).kind;
    const str = (k: string, max: number) => {
      const v = (b as Record<string, unknown>)[k];
      return typeof v === "string" ? v.slice(0, max) : "";
    };
    const rawAlign = (b as { align?: unknown }).align;
    const align: Align | undefined =
      rawAlign === "center" || rawAlign === "right" ? rawAlign : undefined;
    const aligned = align ? { align } : {};
    if (kind === "heading" && str("text", 200).trim())
      out.push({ kind, text: str("text", 200), ...aligned });
    else if (kind === "text" && str("text", 4000).trim())
      out.push({ kind, text: str("text", 4000), ...aligned });
    else if (kind === "button") {
      const url = safeUrl(str("url", 2000));
      const label = str("label", 120).trim();
      if (url && label) out.push({ kind, label, url, ...aligned });
    } else if (kind === "image") {
      const url = safeUrl(str("url", 2000));
      if (url) out.push({ kind, url, alt: str("alt", 200), ...aligned });
    } else if (kind === "divider" || kind === "spacer") out.push({ kind });
  }
  return out;
}

export type BlastBrand = {
  schoolName: string;
  /** Validated hex from lib/branding — pass "" for the default. */
  accentColor: string;
};

const DEFAULT_ACCENT = "#4F46B8";

/** Multiline text → escaped HTML with <br>. */
function para(text: string): string {
  return escapeHtml(text).replaceAll("\n", "<br>");
}

/**
 * Render to email-client HTML: one 600px column, inline styles only, no
 * scripts, no external CSS. Every send carries the school's identity at top
 * and the why-you-got-this footer at bottom — appended here, not trusted to
 * be remembered.
 */
export function blocksToHtml(blocks: EmailBlock[], brand: BlastBrand): string {
  const accent = brand.accentColor || DEFAULT_ACCENT;
  const school = escapeHtml(brand.schoolName);
  // Alignment, the email-client way: text gets text-align, but buttons and
  // images sit inside a full-width table whose cell carries the HTML `align`
  // attribute — the one mechanism Outlook's Word engine actually honours.
  const textAlign = (a?: Align) => (a ? `text-align:${a};` : "");
  const cell = (a: Align | undefined, inner: string) =>
    a
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="${a}">${inner}</td></tr></table>`
      : inner;
  const body = blocks
    .map((b) => {
      switch (b.kind) {
        case "heading":
          return `<h2 style="margin:24px 0 8px;font-size:22px;line-height:1.3;color:#1a1d29;${textAlign(b.align)}">${para(b.text)}</h2>`;
        case "text":
          return `<p style="margin:12px 0;font-size:15px;line-height:1.6;color:#3a3f4e;${textAlign(b.align)}">${para(b.text)}</p>`;
        case "button":
          return cell(
            b.align,
            `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td style="border-radius:10px;background:${accent};">` +
              `<a href="${escapeHtml(b.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(b.label)}</a>` +
              `</td></tr></table>`
          );
        case "image":
          return cell(
            b.align,
            `<img src="${escapeHtml(b.url)}" alt="${escapeHtml(b.alt)}" style="display:inline-block;max-width:100%;border-radius:10px;margin:16px 0;" />`
          );
        case "divider":
          return `<hr style="border:none;border-top:1px solid #e5e2da;margin:22px 0;" />`;
        case "spacer":
          return `<div style="height:24px;line-height:24px;">&nbsp;</div>`;
      }
    })
    .join("\n");

  return (
    `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ec;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ec;padding:24px 12px;"><tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">` +
    `<tr><td style="background:${accent};padding:16px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;">${school}</td></tr>` +
    `<tr><td style="padding:12px 28px 28px;font-family:Arial,Helvetica,sans-serif;">${body}</td></tr>` +
    `<tr><td style="padding:16px 28px;border-top:1px solid #eeece5;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#8a8578;">` +
    `You're receiving this because your child attends ${school}. ` +
    `You can turn these emails off in your family account settings; everything still appears when you sign in.` +
    `</td></tr></table></td></tr></table></body></html>`
  );
}

/** The plain-text twin, for clients that prefer it. */
export function blocksToText(blocks: EmailBlock[], brand: BlastBrand): string {
  const lines = blocks.map((b) => {
    switch (b.kind) {
      case "heading":
        return `\n${b.text.toUpperCase()}\n`;
      case "text":
        return b.text;
      case "button":
        return `${b.label}: ${b.url}`;
      case "image":
        return b.alt ? `[Image: ${b.alt}] ${b.url}` : `[Image] ${b.url}`;
      case "divider":
        return "----------";
      case "spacer":
        return "";
    }
  });
  return [
    brand.schoolName,
    "",
    ...lines,
    "",
    "—",
    `You're receiving this because your child attends ${brand.schoolName}.`,
    "You can turn these emails off in your family account settings.",
  ].join("\n");
}
