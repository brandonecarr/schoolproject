// The navigation registry, and the pinning rules.
//
// Lives here rather than in the Sidebar component for two reasons: the pinned
// row and the group list have to agree about what exists, and the "which group
// am I in" logic is the sort of thing that goes subtly wrong (does /gradebook
// match /grading?) and deserves tests.
//
// ON CUSTOMISATION. Teachers can pin items; they cannot rename or reorder the
// groups. That line is deliberate. Filing 30-odd tools into sensible groups is
// our job and we should do it well. What genuinely varies between schools is
// which handful of things get touched every morning — a four-day school with no
// ESA students has a different hot list from a Florida school billing monthly —
// and that is exactly what a pin expresses.
//
// The cost of going further would be permanent: with user-defined groups, every
// new feature needs a rule for where it lands in a layout that no longer matches
// the default, and the usual outcome is that people who customised never
// discover it. Pinning is purely additive on top of the real structure, so a new
// item always appears in its proper group whether or not anything is pinned.

export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { group: string; items: NavItem[] };

export const TEACHER_NAV: NavGroup[] = [
  {
    group: "Today",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/notifications", label: "Notifications", icon: "messages" },
      { href: "/attendance", label: "Attendance", icon: "attendance" },
      { href: "/observations", label: "Observations", icon: "observations" },
      { href: "/grading", label: "Grading queue", icon: "grading" },
    ],
  },
  // "Learning" used to hold 13 of the 32 items, which made collapsing it
  // pointless — it just hid a grab-bag. It was really two jobs: making the work,
  // and seeing how it went.
  {
    group: "Teaching",
    items: [
      { href: "/courses", label: "Courses", icon: "courses" },
      { href: "/pages", label: "Pages", icon: "courses" },
      { href: "/modules", label: "Modules", icon: "courses" },
      { href: "/syllabus", label: "Syllabus", icon: "courses" },
      { href: "/calendar", label: "Calendar", icon: "attendance" },
      { href: "/assignments", label: "Assignments", icon: "assignments" },
      { href: "/worksheets", label: "Worksheets", icon: "assignments" },
      { href: "/banks", label: "Question banks", icon: "assignments" },
    ],
  },
  {
    group: "Progress",
    items: [
      { href: "/gradebook", label: "Gradebook", icon: "grading" },
      { href: "/outcomes", label: "Standards", icon: "evidence" },
      { href: "/mastery", label: "Mastery board", icon: "evidence" },
      { href: "/paths", label: "Mastery paths", icon: "evidence" },
    ],
  },
  {
    group: "People",
    items: [
      { href: "/students", label: "Students", icon: "students" },
      { href: "/invites", label: "Invite families", icon: "invites" },
      { href: "/conferences", label: "Conferences", icon: "attendance" },
      { href: "/reports", label: "Records & exports", icon: "evidence" },
    ],
  },
  {
    group: "Money",
    items: [
      { href: "/evidence", label: "Evidence board", icon: "evidence" },
      { href: "/invoices", label: "ESA invoices", icon: "invoices" },
      { href: "/billing", label: "Tuition", icon: "billing" },
      { href: "/cashflow", label: "Cash flow", icon: "cashflow" },
    ],
  },
  {
    group: "Family",
    items: [
      { href: "/announcements", label: "Announcements", icon: "messages" },
      { href: "/messages", label: "Messages", icon: "messages" },
    ],
  },
  {
    group: "Admin",
    items: [
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/sources", label: "Rule sources", icon: "evidence" },
      { href: "/proposals", label: "Rule proposals", icon: "evidence" },
      { href: "/audit", label: "Audit log", icon: "audit" },
    ],
  },
];

/** What a teacher touches on an ordinary morning, before they change it. */
export const DEFAULT_PINS = ["/dashboard", "/attendance", "/grading"];

/** Keep the pinned row short enough to stay a shortcut rather than a second nav. */
export const MAX_PINS = 8;

export function allItems(nav: NavGroup[] = TEACHER_NAV): NavItem[] {
  return nav.flatMap((g) => g.items);
}

/**
 * Does this nav item match the current path?
 *
 * Appending "/" before the prefix test is what stops /grading matching
 * /gradebook, and /pages matching /paths. Dashboard is exact-only because it is
 * the root of the console and would otherwise match everything under it.
 */
export function isActive(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  return pathname.startsWith(href + "/");
}

/**
 * Which group holds the current route — the one to open on load.
 *
 * Longest href wins, so a future nested item beats its parent. Returns null for
 * a page that isn't in the nav at all (an invoice detail, say), and the caller
 * should then leave the accordion as the user left it rather than closing
 * everything.
 */
export function groupForPath(pathname: string, nav: NavGroup[] = TEACHER_NAV): string | null {
  let best: { group: string; len: number } | null = null;
  for (const g of nav) {
    for (const it of g.items) {
      if (isActive(it.href, pathname) && (!best || it.href.length > best.len)) {
        best = { group: g.group, len: it.href.length };
      }
    }
  }
  return best?.group ?? null;
}

// --- Pins -------------------------------------------------------------------

/** Read the stored JSON, discarding anything that is no longer a real nav item.
 *  A removed feature must not leave a dead shortcut behind. */
export function parsePins(json: string | null | undefined, nav: NavGroup[] = TEACHER_NAV): string[] {
  let raw: unknown;
  try {
    raw = json ? JSON.parse(json) : null;
  } catch {
    return [...DEFAULT_PINS];
  }
  if (!Array.isArray(raw)) return [...DEFAULT_PINS];
  const known = new Set(allItems(nav).map((i) => i.href));
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === "string" && known.has(x) && !out.includes(x)) out.push(x);
  }
  return out.slice(0, MAX_PINS);
}

/** Pin or unpin, preserving order. Returns the new list. */
export function togglePin(pins: string[], href: string, nav: NavGroup[] = TEACHER_NAV): string[] {
  if (!allItems(nav).some((i) => i.href === href)) return pins;
  if (pins.includes(href)) return pins.filter((p) => p !== href);
  // Silently dropping the pin at the cap would look broken; refuse instead and
  // let the UI say the row is full.
  if (pins.length >= MAX_PINS) return pins;
  return [...pins, href];
}

/** Resolve pinned hrefs to items, in pin order. */
export function pinnedItems(pins: string[], nav: NavGroup[] = TEACHER_NAV): NavItem[] {
  const byHref = new Map(allItems(nav).map((i) => [i.href, i]));
  return pins.map((p) => byHref.get(p)).filter((x): x is NavItem => Boolean(x));
}
