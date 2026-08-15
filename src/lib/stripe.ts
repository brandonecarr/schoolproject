// Stripe, by hand: the three calls the paywall needs, spoken over plain
// fetch instead of the SDK. Less surface, no dependency, and the webhook
// signature check is implemented here where it can be read and tested.
//
// Configuration is three env vars. Absent any of them the paywall is OFF and
// signup falls back to direct creation — which is what local dev, preview
// deployments and the smoke test want.
//
//   STRIPE_SECRET_KEY        sk_live_... / sk_test_...
//   STRIPE_PRICE_ID          price_... for the $149/mo school subscription
//   STRIPE_PRICE_ID_FAMILY   price_... for the $29/mo homeschool-family plan
//   STRIPE_WEBHOOK_SECRET    whsec_... for /api/stripe/webhook
//
// stripeConfigured() is keyed on the SCHOOL price on purpose: it is the
// paywall's on/off switch and predates the family tier. The family price is
// additive — absent, the family option is closed (never billed at the school
// price, never provisioned free in production) while schools keep working.
//
// Money boundary, stated once: this bills COHORT'S subscription. It has
// nothing to do with ESA funds, which Cohort never touches.

import crypto from "node:crypto";

const API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

/** The Stripe price for an account kind, or null when that kind has none. */
export function priceIdFor(kind: "school" | "family"): string | null {
  if (kind === "family") return process.env.STRIPE_PRICE_ID_FAMILY || null;
  return process.env.STRIPE_PRICE_ID || null;
}

/** Can a family sign up right now? True with no paywall at all (dev/preview),
 *  or when the family price exists. Used to hide the option, not just to
 *  refuse it. */
export function familyTierOpen(): boolean {
  return !stripeConfigured() || Boolean(process.env.STRIPE_PRICE_ID_FAMILY);
}

async function stripeCall(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message ?? res.statusText;
    throw new Error(`Stripe ${path}: ${err}`);
  }
  return json;
}

/** Create a subscription Checkout Session for a signup intent. */
export async function createCheckoutSession(opts: {
  intentId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
  /** Which plan. Defaults to the school price so existing callers are unchanged. */
  priceId?: string;
}): Promise<{ id: string; url: string }> {
  const s = await stripeCall("POST", "/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": opts.priceId ?? process.env.STRIPE_PRICE_ID!,
    "line_items[0][quantity]": "1",
    customer_email: opts.email,
    client_reference_id: opts.intentId,
    "metadata[intentId]": opts.intentId,
    "subscription_data[metadata][intentId]": opts.intentId,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });
  return { id: String(s.id), url: String(s.url) };
}

export type CheckoutSession = {
  id: string;
  status: string; // open | complete | expired
  paymentStatus: string; // paid | unpaid | no_payment_required
  clientReferenceId: string;
  customerId: string;
  subscriptionId: string;
};

export async function getCheckoutSession(id: string): Promise<CheckoutSession> {
  const s = await stripeCall("GET", `/checkout/sessions/${encodeURIComponent(id)}`);
  return {
    id: String(s.id),
    status: String(s.status ?? ""),
    paymentStatus: String(s.payment_status ?? ""),
    clientReferenceId: String(s.client_reference_id ?? ""),
    customerId: String(s.customer ?? ""),
    subscriptionId: String(s.subscription ?? ""),
  };
}

/**
 * Verify a Stripe webhook signature against the RAW request body.
 *
 * Scheme: the Stripe-Signature header carries `t=<unix>,v1=<hex>,...`; the
 * signed payload is `${t}.${rawBody}` HMAC-SHA256'd with the endpoint
 * secret. Comparison is constant-time and the timestamp must be within
 * five minutes — a captured request cannot be replayed later.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!signatureHeader) return false;
  const parts = new Map<string, string[]>();
  for (const piece of signatureHeader.split(",")) {
    const [k, v] = piece.split("=", 2);
    if (!k || v === undefined) continue;
    parts.set(k.trim(), [...(parts.get(k.trim()) ?? []), v]);
  }
  const t = parts.get("t")?.[0];
  const sigs = parts.get("v1") ?? [];
  if (!t || sigs.length === 0) return false;

  const ageSec = Math.abs(nowMs / 1000 - Number(t));
  if (!Number.isFinite(ageSec) || ageSec > 300) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  return sigs.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}
