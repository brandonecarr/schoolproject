// The ⚑ warning, but derived from evidence instead of hardcoded.
//
// Until now every page that mentioned a rail printed the same fixed sentence,
// driven by `rail.verify` in rules.ts, which is a constant. That meant a school
// could be paid ten times on ClassWallet and still be told its rules had never
// been checked — the warning was permanent furniture, and permanent warnings
// stop being read.
//
// Now the same places report what the RailObservation ledger actually says. The
// static flag survives as the floor (nothing starts out verified); evidence is
// the only thing that lifts it.

import { VerifyFlag, Pill } from "@/components/ui";
import { CONFIRM_PAID_CYCLES, type RailVerification } from "@/lib/observations";

/**
 * One line about how much to trust the rules for a rail or program.
 *
 * `what` names the thing being described — "ClassWallet's requirements", "the
 * Arizona ESA amount" — so the sentence reads naturally wherever it lands.
 * Renders nothing once confirmed: a rule that has been through real cycles does
 * not need a caveat, and removing it is what makes the remaining ⚑ mean
 * something.
 */
export function VerificationNote({
  v,
  what,
  showWhenConfirmed = false,
}: {
  v: RailVerification;
  what: string;
  showWhenConfirmed?: boolean;
}) {
  if (v.level === "confirmed" && !showWhenConfirmed) return null;

  // Colon form throughout, because `what` may be singular ("the 45-day payment
  // lag") or plural ("ClassWallet's requirements") and a verb would have to
  // agree with both.
  if (v.level === "unverified") {
    return (
      <VerifyFlag>
        {what}:{" "}
        {v.decided === 0
          ? "never tested against a real submission"
          : `no payment yet, and ${v.rejected} rejection${v.rejected === 1 ? "" : "s"} recorded`}
        . Treat as a starting point, not fact.
      </VerifyFlag>
    );
  }

  return (
    <VerifyFlag>
      {what}: {v.paid} paid cycle{v.paid === 1 ? "" : "s"} so far
      {v.school.paid === 0 && v.platform.paid > 0 ? " at other schools" : ""}, out of the{" "}
      {CONFIRM_PAID_CYCLES} we treat as confirmed.
      {v.rejected > 0 ? ` ${v.rejected} rejection${v.rejected === 1 ? "" : "s"} recorded.` : ""}
    </VerifyFlag>
  );
}

/** Compact inline form for tables and list rows. */
export function VerificationChip({ v }: { v: RailVerification }) {
  return (
    <Pill tone={v.tone} title={v.detail}>
      {v.label}
    </Pill>
  );
}
