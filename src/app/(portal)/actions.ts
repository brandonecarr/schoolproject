"use server";

// Parent + student portal mutations.
//
// CRITICAL (COHORT-HANDOFF §4.2): createStudentAccount is the ONLY path that
// creates a student login, and only a parent can call it. Routing account
// creation through the verified parent produces verifiable parental consent by
// construction — the COPPA requirement when a child under 13 logs in.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole, logAudit } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { deleteStudentData } from "@/lib/retention";

export async function createStudentAccount(formData: FormData) {
  const { user } = await requireRole("parent");
  const studentId = String(formData.get("studentId"));

  const ownStudentIds: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  if (!ownStudentIds.includes(studentId)) redirect("/parent"); // not your child

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) redirect("/parent");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect("/parent");

  await prisma.user.create({
    data: {
      schoolId: user.schoolId,
      role: "student",
      name: student.name,
      email,
      password: hashPassword(String(formData.get("password") || "")),
      studentId,
      createdByParent: true,
      consentByUserId: user.id, // the consent event, recorded on the child's record
    },
  });
  await logAudit(user.id, "student_account_created_with_consent", studentId);
  revalidatePath("/parent");
  redirect("/parent?created=1");
}

export async function submitWork(formData: FormData) {
  const { user } = await requireRole("student");
  const id = String(formData.get("id"));

  const sub = await prisma.submission.findUnique({ where: { id } });
  if (!sub || sub.studentId !== user.studentId) redirect("/student"); // not your assignment

  await prisma.submission.update({
    where: { id },
    data: {
      status: "submitted",
      submittedAt: new Date().toISOString(),
      responseText: String(formData.get("responseText") || "").slice(0, 5000),
    },
  });
  await logAudit(user.id, "submitted_work", id);
  revalidatePath("/student");
  redirect("/student?sent=1");
}

// COPPA right to deletion, exercised by the verified parent: permanently delete
// their child and every record tied to them.
export async function deleteChildData(formData: FormData) {
  const { user } = await requireRole("parent");
  const studentId = String(formData.get("studentId"));
  const ownStudentIds: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  if (!ownStudentIds.includes(studentId)) redirect("/parent"); // not your child

  await deleteStudentData(studentId, user.schoolId, user.id);
  revalidatePath("/parent");
  redirect("/parent?deleted=1");
}
