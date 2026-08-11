// POST /api/stripe/webhook — Stripe's side of the paywall.
//
// Two jobs, both idempotent:
//   checkout.session.completed  → fulfill the SignupIntent (covers the
//     founder who paid and never returned to /signup/complete — their
//     school still gets built and the welcome email carries its address)
//   customer.subscription.*     → keep School.subscriptionStatus honest
//     (active | past_due | canceled | ...), matched by subscription id.
//
// The signature is verified against the RAW body before anything is parsed
// — same discipline as the Resend inbound webhook. Status codes follow the
// retry contract: 401 means misconfigured-secret (never retried into
// success), 503 means we aren't configured yet (Stripe retries), 200 means
// handled — including event types we deliberately ignore.

import { NextResponse } from "next/server";
import { prismaSystem } from "@/lib/db";
import { verifyStripeSignature } from "@/lib/stripe";
import { fulfillSignupIntent } from "@/lib/provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const ok = verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), secret);
  if (!ok) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  const obj = event.data?.object ?? {};

  if (event.type === "checkout.session.completed") {
    const intentId = String(obj.client_reference_id ?? "");
    if (intentId) {
      await fulfillSignupIntent(intentId, {
        customerId: String(obj.customer ?? ""),
        subscriptionId: String(obj.subscription ?? ""),
      });
    }
    return NextResponse.json({ received: true });
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subId = String(obj.id ?? "");
    const status = event.type === "customer.subscription.deleted" ? "canceled" : String(obj.status ?? "");
    if (subId && status) {
      // prismaSystem: billing state is platform bookkeeping keyed by Stripe's
      // id, arriving with no tenant context of its own.
      await prismaSystem.school.updateMany({
        where: { stripeSubscriptionId: subId },
        data: { subscriptionStatus: status },
      });
    }
    return NextResponse.json({ received: true });
  }

  // Anything else: acknowledged, deliberately unhandled.
  return NextResponse.json({ received: true });
}
