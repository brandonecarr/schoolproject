// The school's identity with whoever administers its ESA money.
//
// WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT.
//
// The question behind this feature was "how do we prove a school is real and
// not someone scamming the state". The honest answer is that we don't, and we
// must not appear to. Three facts decide the whole design:
//
//   1. THE ADMINISTRATOR ALREADY DID THE VETTING. A school billing an ESA
//      program is already approved by ClassWallet, Step Up For Students,
//      Odyssey, or a state agency. Being in that marketplace IS the credential.
//      Cohort re-checking it would duplicate a check that has already happened
//      and that we are worse placed to make.
//
//   2. THERE IS NO WAY TO CHECK IT. Every one of those marketplaces is behind a
//      login. There is no public directory, no API, and no bulk file. A person
//      can only look a vendor up while signed in AS that vendor. So Cohort
//      cannot verify a provider ID, today or with any amount of engineering.
//
//   3. SAYING WE VERIFIED IT WOULD BE A LIE WITH CONSEQUENCES. A "Verified
//      Provider" badge is a representation Cohort makes to families and,
//      indirectly, to a state reviewer. Getting it wrong is not a bug, it is a
//      misrepresentation about public money.
//
// So this records an ATTESTATION: the school states its provider ID and the
// administrator that issued it, a named person says it is active, and the date
// is kept. Every surface says who said it and when. Nothing here ever renders
// the word "verified" about something Cohort did not witness.
//
// What it buys, which is real: the provider ID goes onto the invoice packet,
// which is where a reviewer matches a claim to an approved provider. Today our
// packets don't carry one.
//
// Pure: no Prisma, no I/O.

import { daysBetween } from "@/lib/due";

/**
 * How long an attestation stands before we ask again.
 *
 * Administrators re-approve vendors on their own cycles and a provider can be
 * suspended without the school noticing until an invoice bounces. Half a school
 * year is the compromise: long enough that nobody is nagged termly, short
 * enough that a stale ID surfaces before a full year of invoices is built on
 * it. Not a rule from any program — our own choice, and the reason it is one
 * named constant.
 */
export const ATTESTATION_DAYS = 180;

/** none — nothing recorded. attested — current. stale — past the window. */
export type ProviderStatus = "none" | "attested" | "stale";

export type Administrator = {
  /** Matches a rail id in rules.ts. */
  rail: string;
  label: string;
  /** What the administrator itself calls the number, so the field label
   *  matches what the school is reading off their own portal. */
  idLabel: string;
  /** Where a school confirms it. All of these need the school's own login —
   *  that is the point, and why Cohort cannot do this for them. */
  confirmAt: string;
  /** Plain-language hint about where the number appears. */
  hint: string;
};

/**
 * ⚑ UNVERIFIED, in the same sense as everything in rules.ts: assembled from
 * public writing about these programs, not from watching a real school read a
 * real number off a real portal. The ID LABELS especially are guesses at what
 * each marketplace calls the field. Correct them from a design partner's screen
 * before treating any of this as fact.
 */
export const ADMINISTRATORS: Administrator[] = [
  {
    rail: "classwallet",
    label: "ClassWallet",
    idLabel: "ClassWallet vendor ID",
    confirmAt: "https://app.classwallet.com",
    hint: "Sign in to ClassWallet and open your vendor profile.",
  },
  {
    rail: "stepup",
    label: "Step Up For Students",
    idLabel: "Step Up provider ID",
    confirmAt: "https://www.stepupforstudents.org",
    hint: "Your provider record in the Step Up portal or MyScholarShop listing.",
  },
  {
    rail: "odyssey",
    label: "Odyssey",
    idLabel: "Odyssey provider ID",
    confirmAt: "https://www.withodyssey.com",
    hint: "Your provider dashboard in Odyssey.",
  },
  {
    rail: "studentfirst",
    label: "Student First Technologies",
    idLabel: "Provider ID",
    confirmAt: "https://studentfirsttech.com",
    hint: "Your provider record in the Student First portal.",
  },
  {
    rail: "ace",
    label: "ACE Scholarships",
    idLabel: "Provider ID",
    confirmAt: "https://acescholarships.org",
    hint: "Your provider record with ACE.",
  },
  {
    rail: "statedirect",
    label: "State agency (direct)",
    idLabel: "Approved-provider number",
    confirmAt: "",
    hint: "The number on your approval letter from the state education agency.",
  },
];

export function administratorFor(rail: string): Administrator | null {
  return ADMINISTRATORS.find((a) => a.rail === rail) ?? null;
}

export type ProviderIdentity = {
  providerId: string;
  providerRail: string;
  /** ISO date (YYYY-MM-DD) or null. */
  providerAttestedAt: string | null;
};

/**
 * Status is DERIVED, never stored.
 *
 * A stored status is a second copy of the truth that drifts the moment someone
 * edits the ID without touching the status column. Two fields already say
 * everything: whether there is an ID, and when it was last stood behind.
 */
export function providerStatus(p: ProviderIdentity, today: string): ProviderStatus {
  if (!p.providerId.trim() || !p.providerRail.trim()) return "none";
  if (!p.providerAttestedAt) return "stale";
  const age = daysBetween(p.providerAttestedAt.slice(0, 10), today);
  // A future-dated attestation is a clock problem, not a fresh one. Negative
  // ages read as stale rather than being trusted.
  if (age < 0) return "stale";
  return age > ATTESTATION_DAYS ? "stale" : "attested";
}

/** Days until this attestation goes stale; negative once it has. Null when
 *  there is nothing to age. */
export function daysUntilStale(p: ProviderIdentity, today: string): number | null {
  if (!p.providerId.trim() || !p.providerAttestedAt) return null;
  return ATTESTATION_DAYS - daysBetween(p.providerAttestedAt.slice(0, 10), today);
}

/**
 * The line that goes on a reimbursement packet.
 *
 * Phrased as the school's own identifier, because on the packet it is exactly
 * that — the number the reviewer matches against their approved-provider list.
 * Returns "" when there is nothing to print; a packet must never carry an empty
 * label implying a number was withheld.
 */
export function packetProviderLine(p: ProviderIdentity): string {
  const id = p.providerId.trim();
  if (!id) return "";
  const admin = administratorFor(p.providerRail);
  return admin ? `${admin.label} provider ID: ${id}` : `Provider ID: ${id}`;
}

/**
 * How this reads to a human, in Cohort's own surfaces.
 *
 * Deliberately never the word "verified". "Confirmed by <name> on <date>" puts
 * the claim where it belongs — on the person who made it.
 */
export function providerSummary(
  p: ProviderIdentity,
  today: string,
  attestedByName?: string | null
): string {
  switch (providerStatus(p, today)) {
    case "none":
      return "No provider ID recorded.";
    case "stale":
      return p.providerAttestedAt
        ? `Last confirmed ${p.providerAttestedAt.slice(0, 10)}${
            attestedByName ? ` by ${attestedByName}` : ""
          } — worth checking it is still active.`
        : "Recorded, but nobody has confirmed it is active.";
    case "attested":
      return `Confirmed active ${p.providerAttestedAt!.slice(0, 10)}${
        attestedByName ? ` by ${attestedByName}` : ""
      }.`;
  }
}

/**
 * Light sanity check on a typed ID.
 *
 * NOT a format validation. We do not know any administrator's ID format, and
 * inventing one would reject real numbers — the failure that costs a school an
 * invoice cycle. This only catches an empty or obviously-pasted-wrong value.
 */
export function looksLikeProviderId(raw: string): boolean {
  const v = raw.trim();
  if (v.length < 3 || v.length > 64) return false;
  // A URL or an email means they pasted the wrong thing off the portal.
  if (/^https?:\/\//i.test(v) || v.includes("@") || /\s{2,}/.test(v)) return false;
  return true;
}
