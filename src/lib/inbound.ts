// Inbound email: webhook verification and the forwarded-message composer.
//
// Resend signs webhooks in the Svix format: HMAC-SHA256 over
// "<id>.<timestamp>.<body>" with the base64 secret from the dashboard
// (whsec_...), sent as space-separated "v1,<base64sig>" entries in
// svix-signature. Verified here with node crypto rather than a dependency —
// it is nine lines of hashing, and a webhook endpoint is exactly the wrong
// place to widen the supply chain.
//
// Pure: no I/O. The route does the fetching and sending.

import { createHmac, timingSafeEqual } from "node:crypto";

/** How stale a webhook timestamp may be before we refuse it (replay guard). */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export function verifyWebhook(input: {
  secret: string; // whsec_... from the Resend dashboard
  id: string; // svix-id header
  timestamp: string; // svix-timestamp header (unix seconds)
  signature: string; // svix-signature header
  body: string; // raw request body, exactly as received
  nowSeconds?: number;
}): boolean {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.body}`)
    .digest();

  // The header carries one or more "v1,<sig>" entries separated by spaces.
  for (const part of input.signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const candidate = Buffer.from(sig, "base64");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true;
  }
  return false;
}

export type ReceivedEmail = {
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  created_at: string;
  attachments?: { filename?: string; content_type?: string; size?: number }[];
};

/** Strip tags well enough for a forwarded copy. Not a sanitizer — the output
 *  is plain text in an email body, never rendered as HTML. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The forwarded copy that lands in the operator's inbox. */
export function composeForward(mail: ReceivedEmail): { subject: string; text: string } {
  const body = mail.text?.trim() || (mail.html ? htmlToText(mail.html) : "") || "(no body)";
  const atts = (mail.attachments ?? [])
    .map((a) => `  - ${a.filename ?? "unnamed"} (${a.content_type ?? "?"}, ${a.size ?? 0} bytes)`)
    .join("\n");
  const lines = [
    `From: ${mail.from}`,
    `To: ${mail.to.join(", ")}`,
    `Date: ${mail.created_at}`,
    ``,
    body,
    atts ? `\nAttachments (view in the Resend dashboard):\n${atts}` : "",
  ];
  return {
    subject: `Fwd: ${mail.subject || "(no subject)"}`.slice(0, 200),
    text: lines.filter((l) => l !== "").join("\n"),
  };
}
