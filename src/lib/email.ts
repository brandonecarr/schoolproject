// Outbound email.
//
// Provider choice: Resend. It has the simplest HTTP API of the three (one POST,
// no SDK required, so no dependency), a free tier that covers a microschool
// several times over, and it's the default in the Next.js ecosystem. The
// adapter boundary below is one function, so swapping to Postmark or SES later
// is an afternoon, not a migration.
//
// FAILS CLOSED. With no RESEND_API_KEY nothing is sent and nothing throws —
// in-app notifications carry on working exactly as they do today. Email is
// strictly an addition to that path, never a replacement, because a school that
// depends on email delivery for "your invoice was rejected" has a worse product
// than one where the alert is always in the app.

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text. We send text-only on purpose — see renderEmail. */
  text: string;
};

export type SendResult =
  | { sent: true; id: string }
  | { sent: false; reason: "not_configured" | "invalid_address" | "provider_error"; detail?: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Conservative check. Not RFC-complete, and deliberately so: the job is to
 *  avoid handing obvious rubbish to the provider, not to adjudicate addresses. */
export function looksLikeEmail(addr: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(String(addr ?? "").trim());
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };
  if (!looksLikeEmail(msg.to)) return { sent: false, reason: "invalid_address" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      return { sent: false, reason: "provider_error", detail: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { id?: string };
    return { sent: true, id: data.id ?? "" };
  } catch (e) {
    return { sent: false, reason: "provider_error", detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Turn a notification into an email body.
 *
 * PLAIN TEXT, and short. Two reasons, both about the recipient rather than us:
 * a parent reading on a phone wants the fact and a link, not a rendered card;
 * and the notification title can contain a child's name, so the less of it that
 * ends up rendered in a preview pane or an HTML archive, the better.
 *
 * The body says what happened and links back. It deliberately does NOT repeat
 * grades, scores, feedback or reflections — email is not a secure channel, it
 * gets forwarded, and the app is one click away.
 */
export function renderEmail(input: {
  title: string;
  body: string;
  linkPath: string;
  schoolName: string;
  appUrl: string;
}): { subject: string; text: string } {
  const url = `${input.appUrl.replace(/\/$/, "")}${input.linkPath || "/"}`;
  const lines = [
    input.title,
    input.body ? `\n${input.body}` : "",
    `\nOpen it here: ${url}`,
    `\n—\n${input.schoolName}, via Cohort.`,
    `You can turn these emails off in the app; you'll still see everything when you sign in.`,
  ];
  return {
    subject: `${input.title} — ${input.schoolName}`.slice(0, 160),
    text: lines.filter(Boolean).join("\n"),
  };
}

/** Base URL for links in emails. Vercel gives us the deployment host; local
 *  falls back so a dev-mode send doesn't produce a dead link. */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
