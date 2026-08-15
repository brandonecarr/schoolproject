// The paywall: with Stripe configured, no school exists until checkout
// completes. These hold the properties that make that safe — the gate, the
// intent's hygiene, the webhook's signature discipline, fulfillment running
// exactly once, and the landing no longer promising a free tier.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import { verifyStripeSignature } from "../src/lib/stripe";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const signupAction = read("src/app/signup/actions.ts");
const provision = read("src/lib/provision.ts");
const webhook = read("src/app/api/stripe/webhook/route.ts");
const completePage = read("src/app/signup/complete/page.tsx");
const landing = read("src/app/page.tsx");

describe("the gate", () => {
  it("with Stripe configured, signup creates an INTENT and redirects to checkout", () => {
    const gated = signupAction.slice(signupAction.indexOf("if (stripeConfigured())"));
    const branch = gated.slice(0, gated.indexOf("// ---- No Stripe configured"));
    expect(branch).toContain("signupIntent.create");
    expect(branch).toContain("createCheckoutSession");
    expect(branch).toContain("redirect(session.url)");
    // The gated branch must never create the school itself.
    expect(branch).not.toContain("provisionSchool");
    expect(branch).not.toContain("school.create");
  });

  it("without Stripe, signup provisions directly — dev, previews and smoke keep working", () => {
    const fallback = signupAction.slice(signupAction.indexOf("// ---- No Stripe configured"));
    expect(fallback).toContain("provisionSchool");
  });

  it("PRODUCTION with no Stripe refuses loudly — no silent free schools", () => {
    const fallback = signupAction.slice(signupAction.indexOf("// ---- No Stripe configured"));
    const guard = fallback.slice(0, fallback.indexOf("provisionSchool"));
    expect(guard).toContain('deploymentEnv() === "production"');
    // err("billing") → "/signup?error=billing" (or ...&kind=family&error=billing).
    expect(guard).toContain('err("billing")');
    // The signup page has words for it.
    expect(read("src/app/signup/page.tsx")).toContain("billing:");
  });

  it("the intent stores a HASH; the raw password never waits anywhere", () => {
    expect(signupAction).toContain("passwordHash: hashPassword(password)");
    expect(signupAction).not.toMatch(/passwordHash:\s*password[,\s]/);
    expect(provision).toContain("ALWAYS pre-hashed");
  });
});

describe("fulfillment", () => {
  it("runs exactly once — consumedAt is claimed atomically before any create", () => {
    const fn = provision.slice(provision.indexOf("export async function fulfillSignupIntent"));
    expect(fn).toMatch(/updateMany\(\{\s*where: \{ id: intentId, consumedAt: null \}/);
    // The claim precedes provisioning.
    expect(fn.indexOf("consumedAt: null")).toBeLessThan(fn.indexOf("provisionSchool"));
  });

  it("a paid founder is never failed over a slug collision", () => {
    const fn = provision.slice(provision.indexOf("export async function fulfillSignupIntent"));
    expect(fn).toContain("availableSlug");
  });

  it("the return page trusts Stripe, not the URL — session is re-fetched and must be complete", () => {
    expect(completePage).toContain("getCheckoutSession(session_id)");
    expect(completePage).toContain('session.status !== "complete"');
  });
});

describe("the webhook", () => {
  it("verifies the signature against the raw body before parsing", () => {
    expect(webhook.indexOf("request.text()")).toBeLessThan(webhook.indexOf("JSON.parse"));
    expect(webhook.indexOf("verifyStripeSignature")).toBeLessThan(webhook.indexOf("JSON.parse"));
  });

  it("follows the retry contract: 503 unconfigured, 401 bad signature", () => {
    expect(webhook).toContain("status: 503");
    expect(webhook).toContain("status: 401");
  });

  it("signature scheme: HMAC over t.body, constant-time, five-minute tolerance", () => {
    const secret = "whsec_test";
    const body = '{"type":"checkout.session.completed"}';
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret)).toBe(true);
    // Wrong secret refused.
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_other")).toBe(false);
    // Tampered body refused.
    expect(verifyStripeSignature(body + " ", `t=${t},v1=${sig}`, secret)).toBe(false);
    // Stale timestamp refused even with a valid signature.
    const old = t - 3600;
    const oldSig = crypto.createHmac("sha256", secret).update(`${old}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${old},v1=${oldSig}`, secret)).toBe(false);
    // Missing header refused.
    expect(verifyStripeSignature(body, null, secret)).toBe(false);
  });
});

describe("the landing keeps its word", () => {
  it("no free, no-card tier remains", () => {
    expect(landing).not.toContain("No card, no expiry");
    expect(landing).not.toContain("Free until your first");
  });

  it("the founding rate is still stated plainly", () => {
    expect(landing).toContain("$149");
    expect(landing).toContain("cancel anytime");
  });
});
