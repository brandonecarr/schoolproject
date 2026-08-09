// Messaging helpers (pure reads). A thread is one conversation per student,
// shared by school staff and that child's family (parent + student login).

import { prisma } from "@/lib/db";
import type { UserModel as User } from "@/generated/prisma/models";

export const isStaff = (role: string) => role === "owner" || role === "teacher";

// Which student ids can this user see threads for?
export async function threadStudentIds(user: User): Promise<string[]> {
  // Operator accounts have no school and therefore no threads.
  if (!user.schoolId) return [];
  if (isStaff(user.role)) {
    const students = await prisma.student.findMany({ where: { schoolId: user.schoolId } });
    return students.map((s) => s.id);
  }
  if (user.role === "parent") return user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  if (user.role === "student" && user.studentId) return [user.studentId];
  return [];
}

export async function canAccessThread(user: User, studentId: string): Promise<boolean> {
  return (await threadStudentIds(user)).includes(studentId);
}

export async function threadFor(studentId: string) {
  return prisma.message.findMany({ where: { studentId }, orderBy: { createdAt: "asc" } });
}

// Unread badge for staff: family-sent messages not yet read by staff.
export async function unreadForStaff(schoolId: string): Promise<number> {
  return prisma.message.count({
    where: { schoolId, senderRole: { in: ["parent", "student"] }, readByStaff: false },
  });
}

// Unread badge for a family member: staff-sent messages on their kids not read.
export async function unreadForFamily(studentIds: string[]): Promise<number> {
  if (studentIds.length === 0) return 0;
  return prisma.message.count({
    where: {
      studentId: { in: studentIds },
      senderRole: { in: ["owner", "teacher"] },
      readByFamily: false,
    },
  });
}
