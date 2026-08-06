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

export const RAILS: Record<string, Rail> = {
  classwallet: {
    id: "classwallet",
    label: "ClassWallet",
    states: ["AZ", "UT", "AR"],
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
    states: ["FL"],
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
    states: ["IA"],
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
};

export type Program = { rail: string; program: string; label: string };

export const PROGRAMS: Record<string, Program> = {
  AZ: { rail: "classwallet", program: "Empowerment Scholarship Account", label: "Arizona ESA" },
  FL: { rail: "stepup", program: "PEP / FES", label: "Florida PEP" },
  IA: { rail: "odyssey", program: "Students First ESA", label: "Iowa ESA" },
  UT: { rail: "classwallet", program: "Utah Fits All", label: "Utah Fits All" },
  AR: { rail: "classwallet", program: "Education Freedom Account", label: "Arkansas EFA" },
};

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
}: ScoreInput): ScoredEvidence {
  const present = attendance.filter((a) => a.status === "present").length;
  const graded = submissions.filter((s) => s.status === "graded").length;
  const withWork = submissions.filter(
    (s) => s.status === "graded" || s.status === "submitted"
  ).length;

  const parts: EvidencePart[] = [
    {
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
