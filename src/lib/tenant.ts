// Subdomain tenancy: turning a school name into a slug, and a Host header back
// into a slug.
//
// Every school gets its own host — cedar-grove.example.com — and that host is
// the tenant boundary the whole app hangs off. Two consequences worth stating
// before the code:
//
//   1. A SLUG IS A PUBLIC, PERMANENT-ISH IDENTIFIER. It appears in every link
//      a school sends a family, in bookmarks, and in the iCal URLs parents have
//      already subscribed to. It is not a display name and should not be
//      regenerated when someone edits their school's name.
//
//   2. THE HOST IS NOT TRUSTED INPUT. It is attacker-controlled — anyone can
//      send any Host header. Resolving it to a school is a database lookup, and
//      the answer is only ever "which tenant is being addressed", never "who is
//      allowed in". Authorisation stays with the session; see requireUser.
//
// Pure: no Prisma, no I/O.

/**
 * Subdomains we will not hand out.
 *
 * Three kinds, and they are here for different reasons:
 *   - infrastructure we use or might (www, app, api, cdn, static, assets)
 *   - things that receive mail or prove ownership, where handing the name to a
 *     tenant would let them intercept it (mail, smtp, imap, mx, autodiscover,
 *     _domainkey) — this is the one that actually matters for security
 *   - product surfaces a school would be confused to find belongs to someone
 *     else (help, support, status, blog, docs, admin, billing, login)
 */
export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "cdn", "static", "assets", "img", "images", "media", "files",
  "mail", "email", "smtp", "imap", "pop", "mx", "ns", "ns1", "ns2", "autodiscover",
  "autoconfig", "_domainkey", "dkim", "dmarc", "spf",
  "admin", "administrator", "root", "system", "internal", "test", "staging", "dev",
  "demo", "preview", "sandbox", "local", "localhost",
  "help", "support", "status", "blog", "docs", "doc", "guide", "guides", "about",
  "pricing", "legal", "privacy", "terms", "security", "login", "signup", "signin",
  "auth", "account", "accounts", "billing", "pay", "payments", "invoice", "invoices",
  "cohort", "school", "schools", "go", "link", "links", "share", "public",
]);

/** Slugs must survive being a DNS label: lowercase, alphanumeric and hyphens,
 *  no leading/trailing hyphen, 63 characters max. */
export const MAX_SLUG_LENGTH = 63;
const MIN_SLUG_LENGTH = 3;

/**
 * "Cedar Grove Learning Collective" → "cedar-grove-learning-collective".
 *
 * Returns "" for input that cannot produce a usable label, rather than
 * inventing one — the caller decides what to do with a school named "..." or
 * written entirely in a script this cannot transliterate.
 */
export function slugify(name: string): string {
  const s = String(name ?? "")
    .normalize("NFKD")
    // Strip combining marks so "Peña" becomes "pena" rather than losing the n.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    // The slice can leave a trailing hyphen behind.
    .replace(/-+$/g, "");
  return s.length >= MIN_SLUG_LENGTH ? s : "";
}

/** Is this a slug we are willing to hand out at all? */
export function isUsableSlug(slug: string): boolean {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) return false;
  if (slug.length < MIN_SLUG_LENGTH || slug.length > MAX_SLUG_LENGTH) return false;
  if (RESERVED_SLUGS.has(slug)) return false;
  // A slug that looks like an IPv4 address or is all digits reads as an
  // address rather than a name, and some resolvers treat it oddly.
  if (/^\d+$/.test(slug)) return false;
  return true;
}

/**
 * Find a free slug for a name, given what is already taken.
 *
 * `taken` is passed in rather than queried so this stays pure and testable; the
 * caller does the lookup and, importantly, still relies on the unique index to
 * settle the race between two schools signing up with the same name at once.
 * This function narrows the odds; the database is what makes it correct.
 */
export function availableSlug(name: string, taken: Iterable<string>): string | null {
  const taken_ = taken instanceof Set ? taken : new Set(taken);
  const base = slugify(name);
  if (!base) return null;

  const free = (s: string) => isUsableSlug(s) && !taken_.has(s);
  if (free(base)) return base;

  // Numeric suffixes, trimming the base so the result still fits a DNS label.
  for (let n = 2; n <= 99; n++) {
    const suffix = `-${n}`;
    const candidate = base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/g, "") + suffix;
    if (free(candidate)) return candidate;
  }
  return null;
}

/**
 * Which tenant is this Host addressing?
 *
 * Returns the slug, or null for the apex and www — those serve the marketing
 * site and signup, not a school.
 *
 * The port is stripped so this works on localhost:3000, and the comparison is
 * case-insensitive because Host casing is not guaranteed. A host that is not
 * under the root domain at all returns null rather than throwing: in
 * production that is a misconfigured proxy or someone pointing their own CNAME
 * at us, and neither should be handed a tenant.
 */
export function slugFromHost(host: string | null | undefined, rootDomain: string): string | null {
  const h = String(host ?? "").toLowerCase().trim().split(":")[0];
  const root = String(rootDomain ?? "").toLowerCase().trim().split(":")[0];
  if (!h || !root) return null;
  if (h === root || h === `www.${root}`) return null;
  if (!h.endsWith(`.${root}`)) return null;

  const label = h.slice(0, -(root.length + 1));
  // Only a single label. "a.b.example.com" is not a tenant — it is either a
  // mistake or someone probing, and guessing which label they meant would be
  // worse than refusing.
  if (label.includes(".")) return null;
  return isUsableSlug(label) ? label : null;
}

/** The full origin for a school, for links that leave the app. */
export function tenantOrigin(slug: string, rootDomain: string, protocol = "https"): string {
  return `${protocol}://${slug}.${rootDomain}`;
}

/**
 * What kind of address is this request arriving on?
 *
 * slugFromHost answers "which tenant" and collapses everything else to null,
 * which is the right shape for a lookup and the wrong shape for routing: the
 * apex, a Vercel preview URL and mail.<root> all come back null, and they need
 * three different answers.
 *
 *   apex     the marketing site and signup. No school, and no app.
 *   tenant   a school's own address. The app, bound to that school.
 *   invalid  under our root domain but not a school we would ever hand out —
 *            mail.<root>, a.b.<root>, -bad.<root>. Someone is probing, or a
 *            wildcard DNS record is catching a typo.
 *   unknown  not under the root domain at all: localhost, a preview
 *            deployment, an IP, or ROOT_DOMAIN simply not configured yet.
 *
 * That last one is the important one. Subdomain tenancy needs DNS, a wildcard
 * certificate and an env var, and none of that exists on a laptop or on a
 * per-branch preview URL. Rather than break those, an address we cannot place
 * runs UNTENANTED — exactly the single-school behaviour this app had before
 * tenancy existed. The strict behaviour switches on the moment ROOT_DOMAIN is
 * set and the request actually arrives on that domain.
 */
export type HostKind =
  | { kind: "apex" }
  | { kind: "tenant"; slug: string }
  | { kind: "invalid" }
  | { kind: "unknown" };

export function classifyHost(
  host: string | null | undefined,
  rootDomain: string | null | undefined
): HostKind {
  const h = String(host ?? "").toLowerCase().trim().split(":")[0];
  const root = String(rootDomain ?? "").toLowerCase().trim().split(":")[0];
  if (!h || !root) return { kind: "unknown" };
  if (h === root || h === `www.${root}`) return { kind: "apex" };
  if (!h.endsWith(`.${root}`)) return { kind: "unknown" };

  const slug = slugFromHost(h, root);
  return slug ? { kind: "tenant", slug } : { kind: "invalid" };
}
