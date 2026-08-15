// Account kind — the ONE dimension that separates a homeschooling family from
// a microschool. Both are tenants with the same engine underneath; a family
// simply doesn't invoice as a provider (it files expense claims from its own
// state wallet), doesn't have staff or other families to talk to, and reads
// "children" where a school reads "students".
//
// Pure module: safe in client bundles and tests. Every UI branch goes through
// isFamily()/copyFor() so the tailoring stays findable, and the kind itself is
// read off session.school — a full School row on every requireTeacher() — so
// tailoring costs zero extra queries.

export type SchoolKind = "school" | "family";

/** Whitelist untrusted input (a form field, a query string). Anything that
 *  isn't exactly "family" is a school — the safe default. */
export function parseKind(raw: unknown): SchoolKind {
  return raw === "family" ? "family" : "school";
}

export function isFamily(school: { kind?: string | null } | null | undefined): boolean {
  return school?.kind === "family";
}

/** The words that differ. Kept tiny on purpose: this is not an i18n system,
 *  it is the handful of nouns a solo parent should never see wrong. */
export const KIND_COPY = {
  school: {
    org: "school",
    Org: "School",
    students: "Students",
    student: "student",
    ownerLabel: "Lead teacher · Owner",
    subline: null as string | null, // schools show their rail label
    moneyCard: "Getting paid",
    moneyLink: "ESA invoices",
    startCta: "Start your school",
    createCta: "Create school",
    nameLabel: "School name",
    namePlaceholder: "Cedar Grove Learning Collective",
    slugLabel: "Your school's web address",
    slugHelp: "Where you and your families sign in. Permanent — keep it short.",
  },
  family: {
    org: "family",
    Org: "Family",
    students: "Children",
    student: "child",
    ownerLabel: "Parent · Owner",
    subline: "Homeschool" as string | null,
    moneyCard: "Getting reimbursed",
    moneyLink: "ESA claims",
    startCta: "Start your homeschool",
    createCta: "Create your family account",
    nameLabel: "Family name",
    namePlaceholder: "The Alvarez Family",
    slugLabel: "Your family's web address",
    slugHelp: "Where you and your kids sign in. Permanent — keep it short.",
  },
} as const;

export function copyFor(school: { kind?: string | null } | null | undefined) {
  return KIND_COPY[isFamily(school) ? "family" : "school"];
}

/** Monthly prices, stated in exactly one place. The landing and signup pages
 *  render these; Stripe holds the matching price ids in env. */
export const PRICE_USD = { school: 149, family: 29 } as const;
