// Seat pricing: 10 students included for a school ($5/extra), 2 children for
// a family ($10/extra). The overage is DERIVED from the roster and synced to
// Stripe as a subscription-item quantity — never accumulated, never trusted
// from a form, never allowed to block adding a child when Stripe is down.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEATS, seatPlanFor, overageFor, overageMonthlyUsd, seatNotice } from "../src/lib/seats";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripe = read("src/lib/stripe.ts");
const billing = read("src/lib/roster-billing.ts");
const actions = read("src/app/(teacher)/actions.ts");
const students = read("src/app/(teacher)/students/page.tsx");
const landing = read("src/app/page.tsx");

describe("the plans", () => {
  it("state the founder's numbers", () => {
    expect(SEATS.school).toEqual({ included: 10, overageUsd: 5 });
    expect(SEATS.family).toEqual({ included: 2, overageUsd: 10 });
    expect(seatPlanFor("family")).toBe(SEATS.family);
    expect(seatPlanFor(undefined)).toBe(SEATS.school);
  });
  it("overage never goes negative and is per-kind", () => {
    expect(overageFor(0, "school")).toBe(0);
    expect(overageFor(10, "school")).toBe(0);
    expect(overageFor(11, "school")).toBe(1);
    expect(overageFor(25, "school")).toBe(15);
    expect(overageFor(2, "family")).toBe(0);
    expect(overageFor(3, "family")).toBe(1);
    expect(overageFor(6, "family")).toBe(4);
  });
  it("monthly dollars follow", () => {
    expect(overageMonthlyUsd(13, "school")).toBe(15);
    expect(overageMonthlyUsd(4, "family")).toBe(20);
    expect(overageMonthlyUsd(1, "family")).toBe(0);
  });
  it("the notice says the exact added dollars, and is silent when included", () => {
    expect(seatNotice(10, "school")).toBeNull();
    expect(seatNotice(11, "school")).toContain("adds $5/month");
    expect(seatNotice(3, "family")).toContain("adds $10/month");
    expect(seatNotice(4, "family")).toContain("adds $20/month");
    expect(seatNotice(4, "family")).toContain("(2 extra × $10)");
  });
});

describe("Stripe sync", () => {
  it("is idempotent — create / update / delete the seat item to match the overage", () => {
    const fn = stripe.slice(stripe.indexOf("export async function syncSeatOverage"));
    expect(fn).toContain('it.price?.id === priceId');
    expect(fn).toContain('stripeCall("DELETE", `/subscription_items/${seatItem.id}`');
    expect(fn).toContain('stripeCall("POST", "/subscription_items"');
    expect(fn).toContain("proration_behavior: \"create_prorations\"");
    // Never throws — a Stripe outage must not block a roster change.
    expect(fn).toContain("return { ok: false, detail:");
  });
  it("is derived from a fresh count and audited", () => {
    expect(billing).toContain("prisma.student.count({ where: { schoolId: school.id } })");
    expect(billing).toContain("overageFor(count, kind)");
    expect(billing).toContain('"seats_synced" : "seats_sync_failed"');
    // No subscription (dev/preview/pre-billing) → nothing to sync.
    expect(billing).toContain("if (!school.stripeSubscriptionId) return;");
  });
  it("runs after every roster change: add, import, delete", () => {
    for (const fn of ["addStudent", "importStudents", "deleteStudent"]) {
      const start = actions.indexOf(`export async function ${fn}(`);
      const next = actions.indexOf("export async function", start + 10);
      const body = actions.slice(start, next);
      expect(body.includes("syncRosterBilling(school!, user.id)"), fn).toBe(true);
    }
  });
});

describe("it is stated up front", () => {
  it("students page shows included count and next-child cost", () => {
    expect(students).toContain("seatNotice(students.length + 1, school!.kind)");
    expect(students).toContain("included {noun}");
  });
  it("landing prices say the included counts and overage", () => {
    expect(landing).toContain("up to 10 students, then $5 per extra student");
    expect(landing).toContain("up to 2 children, then $10 per extra child");
    expect(landing).toContain("$149");
    expect(landing).toContain("cancel anytime");
  });
});
