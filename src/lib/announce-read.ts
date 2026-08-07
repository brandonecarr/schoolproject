// Server-side read for family announcement views. Pairs with the pure rules in
// src/lib/announcements.ts, so both portals ask the same question the same way.

import { prisma } from "@/lib/db";
import { canSee, sortForFamily } from "@/lib/announcements";
import type { UserModel as User } from "@/generated/prisma/models";

export async function announcementsForUser(user: User) {
  if (!user.schoolId) return { items: [], ackedIds: new Set<string>() };

  const rows = await prisma.announcement.findMany({
    // Narrow in SQL as well as in canSee. Belt and braces on purpose: the pure
    // rule is the contract, but a draft should never even be fetched into a
    // family request in the first place.
    where: { schoolId: user.schoolId, publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
  const items = sortForFamily(rows.filter((a) => canSee(a, user.role)));

  const acks = await prisma.announcementAck.findMany({
    where: { userId: user.id, announcementId: { in: items.map((a) => a.id) } },
    select: { announcementId: true },
  });
  return { items, ackedIds: new Set(acks.map((a) => a.announcementId)) };
}
