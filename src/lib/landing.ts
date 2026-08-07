// What the public landing page is allowed to say about state coverage.
//
// The one rule here: the marketing page may never claim more than the code has
// verified. src/lib/rules.ts carries a `verify: true` flag on every rail that
// was inferred from public writing rather than watched surviving a real invoice
// cycle, and its header says plainly that shipping unverified rules as fact is
// the fastest way to get a school's funding clawed back. A landing page is
// exactly where that temptation lives.
//
// So this derives the table instead of restating it. The design handoff showed
// Arizona and Florida as "Supported" and the rest flagged; that split was a
// guess made in a design tool, and today every rail is still verify:true, so
// every row here carries the flag. When a real cycle is observed and a rail's
// flag comes off in rules.ts, this page changes with it and nobody has to
// remember to edit marketing copy.
//
// Pure: no Prisma, no I/O.

import { PROGRAMS, RAILS, type ProgramKind } from "@/lib/rules";

export type LandingState = {
  /** Two-letter code, e.g. "AZ". */
  code: string;
  /** "Arizona". */
  name: string;
  /** "ESA · ClassWallet" — what it is, and who administers it. */
  program: string;
  /** True while the rail is still `verify: true` in rules.ts. */
  unverified: boolean;
};

const KIND_LABEL: Record<ProgramKind, string> = {
  esa: "ESA",
  taxcredit: "Tax-credit scholarship",
  voucher: "Voucher",
  allotment: "Per-pupil allotment",
};

/**
 * Codes to names.
 *
 * All fifty rather than only the configured twenty-three, so adding a state to
 * PROGRAMS never lands a bare "MO" on the marketing page — the failure would be
 * silent and public at the same time.
 */
export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

/**
 * Every configured program, alphabetically by state name, with its verification
 * status taken from the rail rather than from anything written here.
 *
 * A program whose rail is missing is treated as UNVERIFIED rather than skipped.
 * Dropping the row would quietly shrink the coverage list; claiming it would be
 * the exact overclaim this module exists to prevent. Flagging it is the only
 * answer that is wrong in the safe direction.
 */
export function landingStates(): LandingState[] {
  return Object.entries(PROGRAMS)
    .map(([code, p]) => {
      const rail = RAILS[p.rail];
      return {
        code,
        name: STATE_NAMES[code] ?? code,
        program: rail ? `${KIND_LABEL[p.kind]} · ${rail.label}` : KIND_LABEL[p.kind],
        unverified: rail ? rail.verify : true,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
