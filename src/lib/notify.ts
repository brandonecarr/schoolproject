// In-app notifications.
//
// Cohort's promise is that things happen on time, which only works if the
// person who needs to act finds out. This is the single write path: an event
// resolves an audience, then drops a row per recipient.
//
// Deliberately in-app only for now. Email and push (and the per-channel
// preferences they require) come later; keeping one channel means there is no
// half-built preference UI pretending to control something that doesn't exist.

import { prisma } from "@/lib/db";
import { sendEmail, renderEmail, appUrl, emailConfigured } from "@/lib/email";
import { originFor } from "@/lib/tenant-config";

export type NotifyType =
  | "graded"
  | "returned"
  | "submitted"
  | "absence"
  | "message"
  | "report"
  | "invoice"
  | "announcement";

export type NotifyInput = {
  schoolId: string;
  type: NotifyType;
  title: string;
  body?: string;
  linkPath?: string;
};

// Write one notification per recipient. Never notifies the person who caused
// the event — being told about your own action is noise.
export async function notifyUsers(
  userIds: string[],
  input: NotifyInput,
  exceptUserId?: string
): Promise<number> {
  const targets = [...new Set(userIds)].filter((id) => id && id !== exceptUserId);
  if (targets.length === 0) return 0;
  await prisma.notification.createMany({
    data: targets.map((userId) => ({
      schoolId: input.schoolId,
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      linkPath: input.linkPath ?? "",
    })),
  });

  // Email is strictly ADDITIONAL to the in-app row above, never a replacement.
  // It is also fire-and-forget: a provider outage must not fail the grading or
  // invoicing action that triggered it, and the recipient still has the
  // notification waiting when they sign in.
  void emailNotify(targets, input).catch(() => {});

  return targets.length;
}

async function emailNotify(userIds: string[], input: NotifyInput): Promise<void> {
  if (!emailConfigured()) return;
  const [recipients, school] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds }, emailAlerts: true },
      select: { email: true },
    }),
    prisma.school.findUnique({ where: { id: input.schoolId }, select: { name: true, slug: true } }),
  ]);
  if (recipients.length === 0) return;

  const { subject, text } = renderEmail({
    title: input.title,
    body: input.body ?? "",
    linkPath: input.linkPath ?? "",
    schoolName: school?.name ?? "Your school",
    // The school's own address. A notification email sent to a Cedar Grove
    // parent has to link to cedar-grove.<root>, not to whatever host the
    // deployment answers on — the cookie is host-only, so a link to the wrong
    // origin lands them on a sign-in page. originFor is null untenanted, where
    // there is only one origin and appUrl is right.
    appUrl: (school && originFor(school.slug)) || appUrl(),
  });
  // Sequential: a microschool sends a handful at a time, and one address at a
  // time keeps a single bad recipient from taking the rest down with it.
  for (const r of recipients) {
    await sendEmail({ to: r.email, subject, text });
  }
}

// --- audience resolvers --------------------------------------------------

// The parents linked to a child (studentIdsJson is a JSON array of ids).
export async function parentUserIdsFor(studentId: string, schoolId: string): Promise<string[]> {
  const parents = await prisma.user.findMany({ where: { schoolId, role: "parent" } });
  return parents
    .filter((p) => {
      try {
        const ids: string[] = p.studentIdsJson ? JSON.parse(p.studentIdsJson) : [];
        return ids.includes(studentId);
      } catch {
        return false;
      }
    })
    .map((p) => p.id);
}

// The child's own login, if a parent has created one.
export async function studentUserIdFor(studentId: string): Promise<string[]> {
  const u = await prisma.user.findFirst({ where: { role: "student", studentId } });
  return u ? [u.id] : [];
}

// Everyone who runs the school.
export async function staffUserIdsFor(schoolId: string): Promise<string[]> {
  const staff = await prisma.user.findMany({
    where: { schoolId, role: { in: ["owner", "teacher"] } },
  });
  return staff.map((s) => s.id);
}

// Everyone on the family side of the school, by role. Used by announcements,
// which address a role rather than a particular child.
export async function familyUserIdsByRole(
  schoolId: string,
  audience: "all" | "parents" | "students"
): Promise<string[]> {
  const roles =
    audience === "parents" ? ["parent"] : audience === "students" ? ["student"] : ["parent", "student"];
  const users = await prisma.user.findMany({
    where: { schoolId, role: { in: roles } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// Family side of one child: parents + the student.
export async function familyUserIdsFor(studentId: string, schoolId: string): Promise<string[]> {
  const [parents, student] = await Promise.all([
    parentUserIdsFor(studentId, schoolId),
    studentUserIdFor(studentId),
  ]);
  return [...parents, ...student];
}

// --- reads ---------------------------------------------------------------

export async function unreadCountFor(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function notificationsFor(userId: string, take = 40) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
