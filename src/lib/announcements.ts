// Announcement audience and visibility rules.
//
// Pure, and tested, because getting this wrong shows one family's notice to
// another — or worse, shows a draft that was never meant to leave the desk.

export type Audience = "all" | "parents" | "students";

export const AUDIENCES: { value: Audience; label: string; help: string }[] = [
  { value: "all", label: "Everyone", help: "Parents and students." },
  { value: "parents", label: "Parents only", help: "Not shown to student logins." },
  { value: "students", label: "Students only", help: "Not shown to parents." },
];

export type AnnouncementLike = {
  id: string;
  audience: string;
  pinned: boolean;
  publishedAt: string | null;
  createdAt?: Date | string;
};

export const isStaffRole = (role: string) => role === "owner" || role === "teacher";

/**
 * Can this role see this announcement?
 *
 * Staff see everything including drafts — they wrote them. Everyone else sees
 * only what has been published AND is addressed to them. A draft must never
 * leak: "publishedAt is null" is the single gate, checked before audience.
 */
export function canSee(a: AnnouncementLike, role: string): boolean {
  if (isStaffRole(role)) return true;
  if (!a.publishedAt) return false;
  if (a.audience === "all") return true;
  if (a.audience === "parents") return role === "parent";
  if (a.audience === "students") return role === "student";
  // An unrecognised audience fails closed. A typo in the column must hide the
  // announcement, never broadcast it wider than intended.
  return false;
}

/**
 * Family-facing order: pinned first, then newest published first.
 *
 * Sorting on publishedAt rather than createdAt on purpose — an announcement
 * drafted in September and published in November belongs at the top in
 * November, not buried two months back.
 */
export function sortForFamily<T extends AnnouncementLike>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? ""))
  );
}

/** Which announcements still need this user's acknowledgement. */
export function needsAck<T extends AnnouncementLike & { requireAck: boolean }>(
  items: T[],
  role: string,
  ackedIds: Set<string>
): T[] {
  if (isStaffRole(role)) return []; // nobody asks the author to confirm they read it
  return items.filter((a) => a.requireAck && canSee(a, role) && !ackedIds.has(a.id));
}

/** A one-line preview for dashboards and notification bodies. */
export function excerpt(body: string, max = 140): string {
  const flat = String(body ?? "")
    // Strip the markdown that would read as noise out of context.
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + "…";
}
