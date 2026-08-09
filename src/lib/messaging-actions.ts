"use server";

// Shared messaging server actions, usable from the parent, student, and teacher
// surfaces. Auth is re-checked on every call and scoped to threads the caller
// may access.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, logAudit } from "@/lib/auth";
import { canAccessThread, isStaff } from "@/lib/messages";
import {
  notifyUsers,
  staffUserIdsFor,
  parentUserIdsFor,
  studentUserIdFor,
} from "@/lib/notify";

export async function sendMessage(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { user } = session;
  // Messaging is school-app territory; an operator account has no threads.
  if (!user.schoolId) redirect("/cohort-admin");
  const schoolId = user.schoolId;

  const studentId = String(formData.get("studentId"));
  const body = String(formData.get("body") || "").trim().slice(0, 4000);
  const redirectTo = String(formData.get("redirectTo") || "/");
  if (!body || !(await canAccessThread(user, studentId))) redirect(redirectTo);

  const staff = isStaff(user.role);
  await prisma.message.create({
    data: {
      schoolId,
      studentId,
      senderId: user.id,
      senderRole: user.role,
      senderName: user.name,
      body,
      readByStaff: staff, // the sender has "read" their own message
      readByFamily: !staff,
    },
  });
  await logAudit(user.id, "message_sent", studentId);

  // Notify the other side of the thread. Each role gets a link that works for
  // them — parents, students, and staff read messages at different paths.
  const base = {
    schoolId,
    type: "message" as const,
    title: `New message from ${user.name}`,
    body: body.slice(0, 140),
  };
  if (staff) {
    const [parents, studentUser] = await Promise.all([
      parentUserIdsFor(studentId, schoolId),
      studentUserIdFor(studentId),
    ]);
    await notifyUsers(parents, { ...base, linkPath: "/parent/messages" }, user.id);
    await notifyUsers(studentUser, { ...base, linkPath: "/student/messages" }, user.id);
  } else {
    await notifyUsers(
      await staffUserIdsFor(schoolId),
      { ...base, linkPath: `/messages/${studentId}` },
      user.id
    );
  }

  // Refresh every surface that shows this thread or an unread badge.
  revalidatePath("/messages");
  revalidatePath(`/messages/${studentId}`);
  revalidatePath("/parent/messages");
  revalidatePath("/student/messages");
  revalidatePath("/dashboard");
  redirect(redirectTo);
}

// Mark the *other side's* messages in a thread as read (called when the viewer
// opens the thread). Drives the unread badges.
export async function markThreadRead(studentId: string) {
  const session = await getSession();
  if (!session) return;
  const { user } = session;
  if (!(await canAccessThread(user, studentId))) return;

  if (isStaff(user.role)) {
    await prisma.message.updateMany({
      where: { studentId, senderRole: { in: ["parent", "student"] }, readByStaff: false },
      data: { readByStaff: true },
    });
    revalidatePath("/messages");
  } else {
    await prisma.message.updateMany({
      where: { studentId, senderRole: { in: ["owner", "teacher"] }, readByFamily: false },
      data: { readByFamily: true },
    });
    revalidatePath("/parent/messages");
    revalidatePath("/student/messages");
  }
}
