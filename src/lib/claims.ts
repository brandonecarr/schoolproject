// Expense claims — the homeschool family's money surface. Pure helpers only;
// the pages and actions live under src/app/(teacher)/claims.
//
// A claim is one purchase for one child, backed by a receipt and an
// educational-purpose statement, with the weeks of records around it as
// supporting evidence. Cohort prepares the packet. The family submits it in
// their state's wallet portal themselves — never through us.

/**
 * Categories are labels for the FAMILY'S OWN records. They are deliberately
 * not mapped to any program's allowed-use list: that list is the program's,
 * changes yearly, and a wrong "this is allowed" from us would be worse than
 * silence. The UI says so beside the picker.
 */
export const CLAIM_CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: "curriculum", label: "Curriculum & books", hint: "Textbooks, workbooks, full curricula" },
  { key: "tutoring", label: "Tutoring & classes", hint: "A tutor, a co-op class, a lesson" },
  { key: "online_course", label: "Online course", hint: "A subscription or enrolment" },
  { key: "technology", label: "Technology", hint: "A device or software used for schooling" },
  { key: "supplies", label: "Supplies", hint: "Consumables, art, science kits" },
  { key: "therapy", label: "Therapy & services", hint: "Speech, OT, educational therapy" },
  { key: "testing", label: "Testing & assessment", hint: "Standardized tests, evaluations" },
  { key: "extracurricular", label: "Extracurricular", hint: "Music, sport, field trips" },
  { key: "other", label: "Other", hint: "Anything else — describe it in the title" },
];

const CATEGORY_KEYS = new Set(CLAIM_CATEGORIES.map((c) => c.key));

/** Whitelist an untrusted category; unknown → "other". */
export function parseCategory(raw: unknown): string {
  return typeof raw === "string" && CATEGORY_KEYS.has(raw) ? raw : "other";
}

export function categoryLabel(key: string): string {
  return CLAIM_CATEGORIES.find((c) => c.key === key)?.label ?? "Other";
}

/** Same lifecycle words as invoices, so metrics helpers serve both. */
export const CLAIM_STATUSES = ["draft", "submitted", "approved", "paid", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** Whitelist untrusted status. */
export function parseClaimStatus(raw: unknown): ClaimStatus | null {
  return typeof raw === "string" && (CLAIM_STATUSES as readonly string[]).includes(raw)
    ? (raw as ClaimStatus)
    : null;
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The evidence window a claim shows: the month around the purchase — 30 days
 * either side, capped at today. A reviewer asks "what was this used for?";
 * the answer is the instruction logged around when it was bought, not the
 * whole year.
 */
export function claimWindow(purchaseDate: string, today: string): { start: string; end: string } {
  const start = addDays(purchaseDate, -30);
  const naturalEnd = addDays(purchaseDate, 30);
  const end = naturalEnd < today ? naturalEnd : today;
  return { start, end: end < start ? start : end };
}

/** Parse a YYYY-MM-DD from a form; null if malformed. */
export function parseYmd(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

/** Amount as a positive number with at most 2dp, capped; null if invalid. */
export function parseAmount(raw: unknown): number | null {
  const n = Number(String(raw ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return null;
  return Math.round(n * 100) / 100;
}
