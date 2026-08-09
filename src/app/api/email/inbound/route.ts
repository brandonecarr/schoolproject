// POST /api/email/inbound — Resend's inbound webhook, forwarding mail to the
// operator's real inbox.
//
// Every email to the domain (info@, hello@, typos — the MX record catches
// them all) fires this route. It verifies the Svix signature, fetches the
// full message from Resend's Received Email API (the webhook itself carries
// only metadata), and re-sends a plain-text copy to EMAIL_FORWARD_TO.
//
// This is deliberately the FIRST consumer of the inbound pipe, not the last:
// the reimbursement-notification ingestion and walkthrough-lead capture will
// hang off this same webhook, switching on recipient address.
//
// Status codes are the retry contract with Resend:
//   401 — bad or missing signature: not Resend, never retry.
//   503 — we are misconfigured (no secret): retry once someone fixes it.
//   500 — transient (fetch or send failed): retry.
//   200 — handled, including "handled by ignoring".

import { NextResponse } from "next/server";
import { verifyWebhook, composeForward, type ReceivedEmail } from "@/lib/inbound";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const body = await request.text();
  const ok = verifyWebhook({
    secret,
    id: request.headers.get("svix-id") ?? "",
    timestamp: request.headers.get("svix-timestamp") ?? "",
    signature: request.headers.get("svix-signature") ?? "",
    body,
  });
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable" });
  }
  if (event.type !== "email.received" || !event.data?.email_id) {
    return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
  }

  const forwardTo = process.env.EMAIL_FORWARD_TO;
  if (!forwardTo) {
    // Accept rather than 5xx: without a destination there is nothing a retry
    // storm would fix, and the message is safe in Resend's received log.
    console.error("inbound email received but EMAIL_FORWARD_TO is not set");
    return NextResponse.json({ ok: true, ignored: "no forward address" });
  }

  const res = await fetch(`https://api.resend.com/emails/receiving/${event.data.email_id}`, {
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!res.ok) {
    return NextResponse.json({ error: `fetch ${res.status}` }, { status: 500 });
  }
  const mail = (await res.json()) as ReceivedEmail;

  // Loop guard: our own outbound address writing to the domain would forward
  // forever. Nothing legitimate arrives FROM the sending identity.
  const from = (process.env.EMAIL_FROM ?? "").toLowerCase();
  if (from && mail.from && from.includes(mail.from.toLowerCase().replace(/^.*<|>$/g, ""))) {
    return NextResponse.json({ ok: true, ignored: "own sender" });
  }

  const fwd = composeForward(mail);
  const sent = await sendEmail({ to: forwardTo, subject: fwd.subject, text: fwd.text });
  if (!sent.sent) {
    return NextResponse.json({ error: sent.reason }, { status: 500 });
  }
  return NextResponse.json({ ok: true, forwarded: sent.id });
}
