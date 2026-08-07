// The pages the Tier-1 watcher checks every day.
//
// A code constant, not a database table, for the same reason PROGRAMS is: git
// gives us history, review and rollback for free, and a URL registry is not
// something a school should be editing at runtime.
//
// ⚑ Every entry marked `verify: true` is a URL I believe is the authoritative
// page for that program but have not confirmed is the one that actually moves
// when a rule changes. A source can be wrong in two ways, and only the first is
// self-announcing: it can 404 (the watcher reports that loudly), or it can be a
// stable marketing page that never changes while the real handbook lives behind
// a PDF link (the watcher reports nothing, forever, and looks healthy doing it).
// The second failure is why /sources shows "last changed" and not just "last
// checked" — a source that has never once moved is suspicious, not reassuring.
//
// Selecting good sources is the genuinely hard part of this system and cannot
// be automated away. Treat this list as a first draft.

export type SourceKind = "program" | "rail" | "tracker";

export type WatchSource = {
  /** Stable slug. Used as the database key, so renaming one orphans its
   *  history — change the label instead. */
  id: string;
  label: string;
  url: string;
  kind: SourceKind;
  /** State code into PROGRAMS, for program sources. */
  programCode?: string;
  /** Key into RAILS, for administrator sources. */
  railId?: string;
  /** Why this page matters — carried into the Tier-2 prompt so the model knows
   *  what kind of change would be material. */
  watchFor: string;
  verify: boolean;
};

// Administrator pages. These move on contract re-bid and are the highest-
// severity watch: a wrong rail is an instant rejection, not a wrong number.
const RAIL_SOURCES: WatchSource[] = [
  {
    id: "rail-classwallet",
    label: "ClassWallet",
    url: "https://www.classwallet.com/",
    kind: "rail",
    railId: "classwallet",
    watchFor: "States added or dropped from the programs they administer; vendor fee changes.",
    verify: true,
  },
  {
    id: "rail-odyssey",
    label: "Odyssey",
    url: "https://www.withodyssey.com/",
    kind: "rail",
    railId: "odyssey",
    watchFor: "States added or dropped; provider onboarding requirements.",
    verify: true,
  },
  {
    id: "rail-stepup",
    label: "Step Up For Students",
    url: "https://www.stepupforstudents.org/",
    kind: "rail",
    railId: "stepup",
    watchFor: "Scholarship amounts, provider requirements, reimbursement documentation.",
    verify: true,
  },
  {
    id: "rail-studentfirst",
    label: "Student First Technologies",
    url: "https://studentfirsttech.com/",
    kind: "rail",
    railId: "studentfirst",
    watchFor: "States contracted; provider onboarding requirements.",
    verify: true,
  },
  {
    id: "rail-ace",
    label: "ACE Scholarships",
    url: "https://acescholarships.org/",
    kind: "rail",
    railId: "ace",
    watchFor: "Programs administered; approved expense categories.",
    verify: true,
  },
];

// Program pages, one per state in PROGRAMS. What we care about on each: the
// award amount, who administers it, eligibility, application deadlines, and the
// list of approved expenses.
const PROGRAM_WATCH =
  "Award amount, administering vendor, eligibility rules, application deadlines, approved expense categories.";

const PROGRAM_SOURCES: WatchSource[] = [
  { id: "al-choose", label: "Alabama CHOOSE Act", url: "https://www.revenue.alabama.gov/choose-act/", programCode: "AL" },
  { id: "ak-correspondence", label: "Alaska correspondence allotment", url: "https://education.alaska.gov/parents", programCode: "AK" },
  { id: "az-esa", label: "Arizona ESA", url: "https://www.azed.gov/esa", programCode: "AZ" },
  { id: "ar-efa", label: "Arkansas EFA", url: "https://dese.ade.arkansas.gov/offices/office-of-school-choice-and-parent-empowerment/education-freedom-accounts", programCode: "AR" },
  { id: "fl-pep", label: "Florida PEP", url: "https://www.stepupforstudents.org/scholarships/personalized-education-program/", programCode: "FL" },
  { id: "ga-promise", label: "Georgia Promise Scholarship", url: "https://gsfc.georgia.gov/georgia-promise-scholarship", programCode: "GA" },
  { id: "id-tax-credit", label: "Idaho Parental Choice Tax Credit", url: "https://tax.idaho.gov/taxes/parental-choice-tax-credit/", programCode: "ID" },
  { id: "in-esa", label: "Indiana ESA", url: "https://www.in.gov/tos/inesa/", programCode: "IN" },
  { id: "ia-esa", label: "Iowa Students First ESA", url: "https://educate.iowa.gov/pk-12/educational-choice/education-savings-accounts", programCode: "IA" },
  { id: "la-gator", label: "Louisiana LA GATOR", url: "https://doe.louisiana.gov/topic-pages/louisiana-school-choice/la-gator", programCode: "LA" },
  { id: "ms-esa", label: "Mississippi ESA", url: "https://www.mdek12.org/OSA/ESA/", programCode: "MS" },
  { id: "mo-scholars", label: "Missouri MOScholars", url: "https://treasurer.mo.gov/moscholars", programCode: "MO" },
  { id: "mt-esa", label: "Montana ESA", url: "https://opi.mt.gov/Families-Students/Parent-Resources/Education-Savings-Account", programCode: "MT" },
  { id: "nh-efa", label: "New Hampshire EFA", url: "https://www.education.nh.gov/who-we-serve/parents-and-families/education-freedom-account-efa-program", programCode: "NH" },
  { id: "nc-esa-plus", label: "North Carolina ESA+", url: "https://www.ncseaa.edu/k12/esa/", programCode: "NC" },
  { id: "oh-ace", label: "Ohio EdChoice", url: "https://education.ohio.gov/ohioace", programCode: "OH" },
  { id: "ok-tax-credit", label: "Oklahoma Parental Choice Tax Credit", url: "https://oklahoma.gov/tax/individuals/parental-choice-tax-credit.html", programCode: "OK" },
  { id: "sc-estf", label: "South Carolina ESTF", url: "https://ed.sc.gov/newsroom/strategic-engagement/education-scholarship-trust-fund-program", programCode: "SC" },
  { id: "tn-efs", label: "Tennessee EFS", url: "https://www.tn.gov/education/efs.html", programCode: "TN" },
  { id: "tx-esa", label: "Texas Education Freedom Accounts", url: "https://educationfreedom.texas.gov/", programCode: "TX" },
  { id: "ut-fits-all", label: "Utah Fits All", url: "https://utahfitsall.com/", programCode: "UT" },
  { id: "wv-hope", label: "West Virginia Hope Scholarship", url: "https://hopescholarshipwv.com/", programCode: "WV" },
  { id: "wy-esa", label: "Wyoming ESA", url: "https://edu.wyoming.gov/parents/education-savings-accounts/", programCode: "WY" },
].map((s) => ({ ...s, kind: "program" as const, watchFor: PROGRAM_WATCH, verify: true }));

// Aggregators. Worth watching because they cover states we have no program
// entry for yet — this is how a NEW state's program is likely to reach us
// first, and it's a cheap hedge against the per-state URLs above being wrong.
const TRACKER_SOURCES: WatchSource[] = [
  {
    id: "tracker-edchoice",
    label: "EdChoice — school choice in America",
    url: "https://www.edchoice.org/school-choice/",
    kind: "tracker",
    watchFor: "New states enacting programs; programs repealed or expanded.",
    verify: true,
  },
];

export const SOURCES: WatchSource[] = [...RAIL_SOURCES, ...PROGRAM_SOURCES, ...TRACKER_SOURCES];

export function sourceById(id: string): WatchSource | undefined {
  return SOURCES.find((s) => s.id === id);
}
