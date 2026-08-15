// Seat pricing — how many children a plan includes, and what each one past
// that costs. Pure, so the students page, the actions, and the tests all
// compute the same number.
//
//   Microschool:  10 children included, then $5 /child/month
//   Family:        2 children included, then $10 /child/month
//
// The overage is billed as a QUANTITY on a second Stripe subscription item
// (see lib/stripe.ts syncSeatOverage): the base plan stays a flat line, and
// the extra-child line's quantity is kept equal to the roster's overage.
// Stripe prorates the change on the next invoice. Cohort never bills anything
// itself — it tells the subscription the count and Stripe does the rest.

import type { SchoolKind } from "@/lib/kind";

export const SEATS = {
  school: { included: 10, overageUsd: 5 },
  family: { included: 2, overageUsd: 10 },
} as const;

export function seatPlanFor(kind: SchoolKind | string | null | undefined) {
  return SEATS[kind === "family" ? "family" : "school"];
}

/** Children beyond the plan's included count, never negative. */
export function overageFor(childCount: number, kind: SchoolKind | string | null | undefined): number {
  const plan = seatPlanFor(kind);
  return Math.max(0, Math.floor(childCount) - plan.included);
}

/** Monthly dollars the roster adds on top of the flat plan. */
export function overageMonthlyUsd(childCount: number, kind: SchoolKind | string | null | undefined): number {
  return overageFor(childCount, kind) * seatPlanFor(kind).overageUsd;
}

/**
 * The sentence shown before someone adds a child that would cost more.
 * `afterCount` is the roster size AFTER the add(s).
 */
export function seatNotice(afterCount: number, kind: SchoolKind | string | null | undefined): string | null {
  const plan = seatPlanFor(kind);
  const over = overageFor(afterCount, kind);
  if (over === 0) return null;
  const noun = kind === "family" ? "child" : "student";
  return (
    `Your plan includes ${plan.included} ${noun === "child" ? "children" : "students"}. ` +
    `Going to ${afterCount} adds $${plan.overageUsd * over}/month ` +
    `(${over} extra × $${plan.overageUsd}), prorated on your next bill.`
  );
}
