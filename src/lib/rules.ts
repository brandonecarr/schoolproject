// ESA program rules. Ported verbatim from the Express MVP's src/rules.js.
//
// IMPORTANT: every field marked `verify: true` is a placeholder derived from
// public writing about these programs, NOT from a verified submission. Replace
// each one with what you observe in a real invoice cycle during design-partner
// interviews. Shipping unverified rules as fact is the fastest way to get a
// school's funding clawed back. (See COHORT-HANDOFF §4.5 — do not remove the ⚑
// flags until a real invoice cycle has been observed.)

export type RailRequirement = { key: string; label: string };

export type Rail = {
  id: string;
  label: string;
  states: string[];
  vendorFeePct: number;
  verify: boolean;
  requires: RailRequirement[];
  rejectionReasons: string[];
};

// Rails are declared WITHOUT their state list — it is derived from PROGRAMS at
// the bottom of this section so the two can never drift apart. Adding a state is
// therefore a one-line change to PROGRAMS, never an edit in two places.
const RAIL_DEFS: Record<string, Omit<Rail, "states">> = {
  classwallet: {
    id: "classwallet",
    label: "ClassWallet",
    vendorFeePct: 2.5,
    verify: true,
    // What the invoice packet must contain
    requires: [
      { key: "attendance_summary", label: "Attendance summary for the billing period" },
      { key: "purpose_statement", label: "Educational purpose statement tied to the expense" },
      { key: "curriculum_reference", label: "Curriculum or course of study reference" },
      { key: "itemized_amount", label: "Itemized amount with service dates" },
    ],
    // Observed rejection reasons — replace with real taxonomy from Phase 0
    rejectionReasons: [
      "Purpose statement too generic — no link to specific instruction delivered",
      "Service dates outside the approved billing period",
      "Missing curriculum reference for the subject billed",
      "Amount exceeds the family's remaining balance",
      "Student not showing active enrollment on the submission date",
    ],
  },
  stepup: {
    id: "stepup",
    label: "Step Up For Students",
    vendorFeePct: 0,
    verify: true,
    requires: [
      { key: "attendance_summary", label: "Attendance summary for the billing period" },
      { key: "purpose_statement", label: "Educational purpose statement" },
      { key: "work_samples", label: "Evidence of student work" },
      { key: "itemized_amount", label: "Itemized amount with service dates" },
    ],
    rejectionReasons: [
      "Insufficient evidence of instruction delivered",
      "Invoice period overlaps a previously reimbursed period",
      "Provider not showing active status in the marketplace",
      "Missing student work samples",
    ],
  },
  odyssey: {
    id: "odyssey",
    label: "Odyssey",
    vendorFeePct: 0,
    verify: true,
    requires: [
      { key: "attendance_summary", label: "Attendance summary" },
      { key: "purpose_statement", label: "Educational purpose statement" },
      { key: "itemized_amount", label: "Itemized amount with service dates" },
    ],
    rejectionReasons: [
      "Enrollment not confirmed in the state portal",
      "Documentation submitted after the reporting deadline",
    ],
  },
  studentfirst: {
    id: "studentfirst",
    label: "Student First Technologies",
    vendorFeePct: 0,
    verify: true,
    requires: [
      { key: "attendance_summary", label: "Attendance summary for the billing period" },
      { key: "purpose_statement", label: "Educational purpose statement" },
      { key: "itemized_amount", label: "Itemized amount with service dates" },
    ],
    rejectionReasons: [
      "Provider not approved for the category billed",
      "Documentation submitted after the reporting deadline",
    ],
  },
  ace: {
    id: "ace",
    label: "ACE Scholarships",
    vendorFeePct: 0,
    verify: true,
    requires: [
      { key: "attendance_summary", label: "Attendance summary for the billing period" },
      { key: "purpose_statement", label: "Educational purpose statement" },
      { key: "curriculum_reference", label: "Curriculum or course of study reference" },
      { key: "itemized_amount", label: "Itemized amount with service dates" },
    ],
    rejectionReasons: [
      "Expense category not on the approved-use list",
      "Amount exceeds the family's remaining balance",
    ],
  },
  // No marketplace in between: the family (or the school) files with the state
  // agency directly. Fewer intermediaries, but usually stricter paperwork,
  // because nobody is pre-screening the packet before it reaches a reviewer.
  statedirect: {
    id: "statedirect",
    label: "State agency (direct)",
    vendorFeePct: 0,
    verify: true,
    requires: [
      { key: "attendance_summary", label: "Attendance summary for the billing period" },
      { key: "purpose_statement", label: "Educational purpose statement" },
      { key: "curriculum_reference", label: "Curriculum or course of study reference" },
      { key: "work_samples", label: "Evidence of student work" },
      { key: "itemized_amount", label: "Itemized amount with service dates" },
    ],
    rejectionReasons: [
      "Provider not on the state's approved-provider list",
      "Missing documentation of instruction delivered",
      "Service dates outside the approved billing period",
    ],
  },
};

export const RAILS: Record<string, Rail> = Object.fromEntries(
  Object.entries(RAIL_DEFS).map(([id, r]) => [id, { ...r, states: [] as string[] }])
);

// How the money reaches the school. This changes the paperwork more than the
// state does, so it's worth showing the teacher which one she's on.
//  - "esa"       family-controlled account, school invoices against a balance
//  - "taxcredit" credit or scholarship routed through an approving organisation
//  - "voucher"   state pays an approved school directly per enrolled student
//  - "allotment" per-pupil allotment for enrolled home/correspondence students
export type ProgramKind = "esa" | "taxcredit" | "voucher" | "allotment";

export type Program = {
  rail: string;
  program: string;
  label: string;
  kind: ProgramKind;
  /** Approximate annual award per student. A starting figure for the invoice
   *  form, NOT an entitlement — every one of these is set annually and several
   *  are prorated or tiered. Always confirm against the family's award letter. */
  amount: number;
  /** True once the program is actually disbursing. False means enacted but not
   *  yet paying, so a school can select it and plan without invoicing yet. */
  live: boolean;
  /** Eligibility is narrower than "any student in the state". */
  limited?: string;
  /** Other programs the same state runs that a microschool might also bill.
   *  PROGRAMS is keyed by state, so only the primary one is selectable today. */
  alsoRuns?: string[];
  /** Dated obligations this program is publicly documented to carry — SLP
   *  renewals, expense reports, contract renewals. ⚑ SUGGESTIONS ONLY: the
   *  school types the actual date into a ComplianceDeadline, because the date
   *  that counts is on the family's award letter or in the program portal.
   *  Only listed where public writing actually names the obligation; a state
   *  with none listed has none we could ground, not none at all. */
  obligations?: ProgramObligation[];
};

export type ProgramObligation = {
  key: string;
  label: string;
  /** Where the real date lives, and roughly when to expect it. */
  hint: string;
};

// ⚑ EVERY entry below is unverified — see the file header. The rail assignments
// in particular are the shakiest part: states re-bid these contracts, and the
// vendors' own marketing pages contradict each other about who administers what.
// Confirm the administrator with the family's award letter before the first
// invoice, and treat a wrong rail as a guaranteed rejection.
//
// Keyed by state code because Student.esaProgram stores a state code and
// railForState() resolves a school's rail from School.state. A state that runs
// more than one billable program lists the others in `alsoRuns` rather than
// getting a second entry; splitting those out needs a data migration first.
export const PROGRAMS: Record<string, Program> = {
  AL: { rail: "classwallet", program: "CHOOSE Act", label: "Alabama CHOOSE Act", kind: "esa", amount: 7000, live: true, alsoRuns: ["CHOOSE Act home education award (~$2,000)"] },
  AK: { rail: "statedirect", program: "Correspondence school allotment", label: "Alaska correspondence allotment", kind: "allotment", amount: 2700, live: true, limited: "Students enrolled in a district correspondence program" },
  AZ: { rail: "classwallet", program: "Empowerment Scholarship Account", label: "Arizona ESA", kind: "esa", amount: 7400, live: true,
    obligations: [
      {
        key: "az_quarterly_expense",
        label: "Quarterly expense report",
        hint:
          "Due the 20th of the last month of each quarter (Sep, Dec, Mar, Jun) per the ESA parent handbook — required even with zero expenses. Confirm in the family's ESA portal. ⚑",
      },
      {
        key: "az_contract_renewal",
        label: "Annual ESA contract renewal",
        hint:
          "Renewal contracts issued by May 1; the family submits by June 30 (Ariz. Admin. Code R7-2-1506). Confirm each family's dates in their portal. ⚑",
      },
    ],
  },
  AR: { rail: "classwallet", program: "Education Freedom Account", label: "Arkansas EFA", kind: "esa", amount: 7600, live: true },
  FL: { rail: "stepup", program: "Personalized Education Program", label: "Florida PEP", kind: "esa", amount: 8000, live: true, alsoRuns: ["Family Empowerment Scholarship (FES-EO / FES-UA)"],
    obligations: [
      {
        key: "fl_slp_renewal",
        label: "Student Learning Plan (SLP) submission",
        hint:
          "PEP families submit an SLP to their scholarship organisation annually — a late initial SLP has cost students the year's funding (May 31 for 2026-27, per FLDOE). Confirm this year's date in the portal. ⚑",
      },
    ],
  },
  GA: { rail: "odyssey", program: "Georgia Promise Scholarship", label: "Georgia Promise Scholarship", kind: "esa", amount: 6500, live: true, limited: "Students zoned to a low-performing public school" },
  ID: { rail: "statedirect", program: "Parental Choice Tax Credit", label: "Idaho Parental Choice Tax Credit", kind: "taxcredit", amount: 5000, live: true },
  IN: { rail: "classwallet", program: "Education Scholarship Account", label: "Indiana ESA", kind: "esa", amount: 7500, live: true, limited: "Students with a disability or service plan" },
  IA: { rail: "odyssey", program: "Students First ESA", label: "Iowa ESA", kind: "esa", amount: 7800, live: true },
  LA: { rail: "odyssey", program: "LA GATOR Scholarship", label: "Louisiana LA GATOR", kind: "esa", amount: 7500, live: true },
  MS: { rail: "statedirect", program: "Education Scholarship Account", label: "Mississippi ESA", kind: "esa", amount: 7000, live: true, limited: "Students with an IEP" },
  MO: { rail: "statedirect", program: "MOScholars", label: "Missouri MOScholars", kind: "taxcredit", amount: 6400, live: true },
  MT: { rail: "statedirect", program: "Education Savings Account", label: "Montana ESA", kind: "esa", amount: 8000, live: true, limited: "Students with a disability" },
  NH: { rail: "statedirect", program: "Education Freedom Account", label: "New Hampshire EFA", kind: "esa", amount: 5200, live: true },
  NC: { rail: "classwallet", program: "ESA+", label: "North Carolina ESA+", kind: "esa", amount: 9000, live: true, limited: "Students with a disability", alsoRuns: ["Opportunity Scholarship (private school tuition)"] },
  // Ohio's ACE enrichment ESA wound down (final claims October 2025), so the
  // billable Ohio program is now the EdChoice voucher. Caught by the source
  // watcher's URL validation, which is exactly the class of change it exists
  // for — a program can end while our table still offers it.
  OH: { rail: "statedirect", program: "EdChoice Scholarship", label: "Ohio EdChoice", kind: "voucher", amount: 6166, live: true, alsoRuns: ["Afterschool Child Enrichment (ACE) — ended, final claims October 2025"] },
  OK: { rail: "statedirect", program: "Parental Choice Tax Credit", label: "Oklahoma Parental Choice Tax Credit", kind: "taxcredit", amount: 7500, live: true },
  SC: { rail: "classwallet", program: "Education Scholarship Trust Fund", label: "South Carolina ESTF", kind: "esa", amount: 7500, live: true },
  TN: { rail: "studentfirst", program: "Education Freedom Scholarship", label: "Tennessee EFS", kind: "esa", amount: 7300, live: true, alsoRuns: ["Individualized Education Account (IEA)"] },
  // Renamed from "Education Savings Account" to Texas Education Freedom
  // Accounts in October 2025, and it is now funding students — the `live: false`
  // written yesterday from pre-launch reporting was already stale.
  TX: { rail: "odyssey", program: "Texas Education Freedom Accounts (TEFA)", label: "Texas Education Freedom Accounts", kind: "esa", amount: 10500, live: true, alsoRuns: ["Special-needs award (~$30,000)"] },
  UT: { rail: "ace", program: "Utah Fits All Scholarship", label: "Utah Fits All", kind: "esa", amount: 8000, live: true },
  WV: { rail: "studentfirst", program: "Hope Scholarship", label: "West Virginia Hope Scholarship", kind: "esa", amount: 5200, live: true },
  WY: { rail: "odyssey", program: "Steamboat Legacy Scholarship", label: "Wyoming ESA", kind: "esa", amount: 7000, live: true },
};

// Backfill each rail's state list from PROGRAMS so the two can't drift.
for (const [state, p] of Object.entries(PROGRAMS)) {
  RAILS[p.rail]?.states.push(state);
}

/** Programs in the order a human scans them: alphabetical by label, which is
 *  also alphabetical by state, because every label leads with the state name. */
export function programOptions(): (Program & { code: string })[] {
  return Object.entries(PROGRAMS)
    .map(([code, p]) => ({ code, ...p }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The state codes that have a program configured.
 *
 * Exported so user-facing copy can be DERIVED rather than written out. The
 * signup form used to say "AZ, FL, IA, UT and AR" in prose; by the time anyone
 * noticed, PROGRAMS held 23 states and the sentence was turning away eighteen
 * states' worth of schools. Nothing hand-counts this list again.
 */
export function configuredStates(): string[] {
  return Object.keys(PROGRAMS).sort();
}

export function railForState(state: string): Rail | null {
  const p = PROGRAMS[state];
  return p ? RAILS[p.rail] : null;
}

// --- Evidence scoring -------------------------------------------------------
// The whole product thesis lives here: teaching generates proof. This function
// measures how much proof exists for one student over one billing period, so
// the teacher can see gaps BEFORE she submits and gets rejected.

export type EvidencePart = {
  key: string;
  label: string;
  count: number;
  ok: boolean;
  need: string;
  weight: number;
};

export type ScoredEvidence = {
  score: number;
  parts: EvidencePart[];
  presentDays: number;
};

type ScoreInput = {
  attendance: { status: string }[];
  submissions: { status: string }[];
  observations: unknown[];
  assignments: unknown[];
  samples?: unknown[];
  // Instructional days the school's published calendar says fell in this period.
  // Omit (or pass null) and scoring is unchanged — a school with no published
  // calendar is measured exactly as before.
  instructionalDays?: number | null;
  // Standards mastery, when the school tracks standards. Omit (or pass null) and
  // scoring is unchanged — schools that don't use standards aren't penalised.
  standards?: { assessed: number; mastered: number } | null;
};

export function scoreEvidence({
  attendance,
  submissions,
  observations,
  assignments,
  samples = [],
  standards = null,
  instructionalDays = null,
}: ScoreInput): ScoredEvidence {
  const present = attendance.filter((a) => a.status === "present").length;
  const graded = submissions.filter((s) => s.status === "graded").length;
  const withWork = submissions.filter(
    (s) => s.status === "graded" || s.status === "submitted"
  ).length;

  const parts: EvidencePart[] = [
    // "At least 8 days" is a number we invented. Once a school publishes term
    // dates, the honest test is whether attendance was logged for every
    // instructional day its own calendar claims — which is what a reviewer
    // comparing the two documents will check. Without a calendar we keep the
    // old flat threshold, so nothing changes for a school that hasn't set one.
    instructionalDays && instructionalDays > 0
      ? {
          key: "attendance",
          label: `Attendance logged (${attendance.length} of ${instructionalDays} instructional days)`,
          count: attendance.length,
          ok: attendance.length >= instructionalDays,
          need: `An attendance record for each of the ${instructionalDays} instructional days your calendar lists`,
          weight: 30,
        }
      : {
          key: "attendance",
          label: "Attendance days logged",
          count: attendance.length,
          ok: attendance.length >= 8,
          need: "At least 8 attendance days in the period",
          weight: 30,
        },
    {
      key: "instruction",
      label: "Assignments delivered",
      count: assignments.length,
      ok: assignments.length >= 3,
      need: "At least 3 assignments tied to a course",
      weight: 25,
    },
    {
      key: "work",
      label: "Student work submitted",
      count: withWork,
      ok: withWork >= 2,
      need: "At least 2 pieces of submitted student work",
      weight: 25,
    },
    {
      key: "assessment",
      label: "Work graded with feedback",
      count: graded,
      ok: graded >= 1,
      need: "At least 1 graded submission with written feedback",
      weight: 10,
    },
    {
      key: "samples",
      label: "Work samples attached",
      count: samples.length,
      ok: samples.length >= 1,
      need: "At least 1 photo or scan of actual student work",
      weight: 5,
    },
    {
      key: "narrative",
      label: "Teacher observations",
      count: observations.length,
      ok: observations.length >= 1,
      need: "At least 1 written observation",
      weight: 5,
    },
  ];

  // Standards mastery is the strongest single statement of educational progress
  // a reviewer can read, so it earns its own part — but only for schools that
  // actually track standards. The score is normalised by the weight of the parts
  // in play, so adding this part can't silently deflate everyone else's score.
  if (standards) {
    parts.push({
      key: "standards",
      label: "Standards mastery demonstrated",
      count: standards.mastered,
      ok: standards.mastered >= 1,
      need: "At least 1 standard demonstrated as mastered from aligned work",
      weight: 10,
    });
  }

  const earned = parts.reduce(
    (sum, p) => sum + (p.ok ? p.weight : Math.round(p.weight * 0.35)),
    0
  );
  const possible = parts.reduce((sum, p) => sum + p.weight, 0) || 1;
  const score = Math.round((earned / possible) * 100);
  return { score: Math.min(100, score), parts, presentDays: present };
}

export type Readiness = { label: string; tone: "good" | "warn" | "bad" };

export function readiness(score: number): Readiness {
  if (score >= 90) return { label: "Ready to submit", tone: "good" };
  if (score >= 70) return { label: "Thin — likely to be questioned", tone: "warn" };
  return { label: "Not enough evidence", tone: "bad" };
}
