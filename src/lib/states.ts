// What the public per-state pages are allowed to say.
//
// Same contract as landing.ts, one layer deeper: these pages exist to be found
// by someone searching "microschool ESA software arizona", and everything they
// assert about a program is DERIVED from src/lib/rules.ts rather than written
// into marketing copy. rules.ts is where claims carry their ⚑ verification
// state and their "confirm against the award letter" caveats; a page generated
// from it inherits those, and a page written by hand would shed them.
//
// So this module produces data, and the route renders it. It never invents:
// no award amount without the approximate framing, no rail presented as
// verified while rules.ts still says verify:true, no obligation date at all —
// obligations carry hints about where the real date lives, which is the same
// rule the in-app deadline feature enforces.
//
// Pure: no Prisma, no I/O.

import { PROGRAMS, RAILS, type ProgramKind, type ProgramObligation } from "@/lib/rules";
import { STATE_NAMES } from "@/lib/landing";

export type StatePage = {
  /** Two-letter code, e.g. "AZ". */
  code: string;
  /** URL segment, e.g. "arizona", "new-hampshire". Full names, not codes:
   *  the person searching types the state's name, so the URL should too. */
  slug: string;
  /** "Arizona". */
  name: string;
  /** "Arizona ESA" — the display label from rules.ts. */
  label: string;
  /** Official program name, e.g. "Empowerment Scholarship Account". */
  program: string;
  /** "ESA", "Tax-credit scholarship", … */
  kindLabel: string;
  /** Administrator label, e.g. "ClassWallet", or null when the rail is
   *  unconfigured — render nothing rather than a guess. */
  railLabel: string | null;
  /** Approximate annual award. ALWAYS render with approximate framing. */
  amount: number;
  /** False = enacted but not yet disbursing; the page must say so. */
  live: boolean;
  /** Eligibility narrower than "any student", or null. */
  limited: string | null;
  /** Other billable programs the state runs. */
  alsoRuns: string[];
  /** Dated obligations rules.ts can ground — hints only, never dates. */
  obligations: ProgramObligation[];
  /** What the administrator asks for on an invoice, from the rail. */
  requires: string[];
  /** True while the rail is still verify:true (or missing) in rules.ts. */
  unverified: boolean;
};

const KIND_LABEL: Record<ProgramKind, string> = {
  esa: "ESA",
  taxcredit: "Tax-credit scholarship",
  voucher: "Voucher",
  allotment: "Per-pupil allotment",
};

/** "New Hampshire" → "new-hampshire". */
export function stateSlug(code: string): string {
  return (STATE_NAMES[code] ?? code).toLowerCase().replace(/\s+/g, "-");
}

/**
 * Every configured program as a page, alphabetically by state name.
 *
 * Missing-rail handling matches landing.ts: the page still exists (dropping it
 * would shrink public coverage silently) but railLabel is null and the page is
 * unverified — wrong in the safe direction.
 */
export function statePages(): StatePage[] {
  return Object.entries(PROGRAMS)
    .map(([code, p]) => {
      const rail = RAILS[p.rail];
      return {
        code,
        slug: stateSlug(code),
        name: STATE_NAMES[code] ?? code,
        label: p.label,
        program: p.program,
        kindLabel: KIND_LABEL[p.kind],
        railLabel: rail ? rail.label : null,
        amount: p.amount,
        live: p.live,
        limited: p.limited ?? null,
        alsoRuns: p.alsoRuns ?? [],
        obligations: p.obligations ?? [],
        requires: rail ? rail.requires.map((r) => r.label) : [],
        unverified: rail ? rail.verify : true,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function statePageBySlug(slug: string): StatePage | null {
  return statePages().find((s) => s.slug === slug) ?? null;
}
