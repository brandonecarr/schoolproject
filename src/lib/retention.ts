// Data retention + deletion — the COPPA obligations (COHORT-HANDOFF §4.2, §6.3).
//
//  - Indefinite retention of child data is prohibited. purgeSchool() deletes
//    child-activity records older than the school's retention window.
//  - Families have a right to deletion. deleteStudentData() hard-deletes a
//    child and everything tied to them, and writes an audit entry.
//
// Financial records (invoices, payments) are intentionally NOT time-purged —
// they're kept for tax/reimbursement audit — but a full family-deletion request
// DOES remove them, because they contain the child's PII.

import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/auth";

export type PurgeResult = {
  schoolId: string;
  cutoffDate: string;
  attendance: number;
  observations: number;
  submissions: number;
  files: number;
};

// Purge child-activity records older than one school's retention window.
export async function purgeSchool(school: { id: string; retentionDays: number }): Promise<PurgeResult> {
  const ms = school.retentionDays * 86_400_000;
  const cutoff = new Date(Date.now() - ms);
  const cutoffDate = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD (date-string fields)
  const cutoffIso = cutoff.toISOString(); // ISO string / DateTime fields

  const [attendance, observations, submissions, files] = await prisma.$transaction([
    prisma.attendance.deleteMany({ where: { schoolId: school.id, date: { lt: cutoffDate } } }),
    prisma.observation.deleteMany({ where: { schoolId: school.id, date: { lt: cutoffDate } } }),
    prisma.submission.deleteMany({ where: { schoolId: school.id, createdAt: { lt: cutoff } } }),
    prisma.fileRec.deleteMany({ where: { schoolId: school.id, capturedAt: { lt: cutoffIso } } }),
  ]);

  const result: PurgeResult = {
    schoolId: school.id,
    cutoffDate,
    attendance: attendance.count,
    observations: observations.count,
    submissions: submissions.count,
    files: files.count,
  };
  const total = result.attendance + result.observations + result.submissions + result.files;
  if (total > 0) {
    await logAudit(null, "retention_purge", `${school.id}: purged ${total} records older than ${cutoffDate}`);
  }
  return result;
}

// Run the retention purge across every school (the nightly job).
export async function purgeAllSchools(): Promise<PurgeResult[]> {
  const schools = await prisma.school.findMany({ select: { id: true, retentionDays: true } });
  const results: PurgeResult[] = [];
  for (const s of schools) results.push(await purgeSchool(s));
  return results;
}

export type DeleteResult = {
  attendance: number;
  observations: number;
  submissions: number;
  files: number;
  invoices: number;
  payments: number;
  loginRemoved: boolean;
};

// Full right-to-deletion: remove a child and every record tied to them, detach
// them from their parent, and delete their login. Writes an audit entry (the
// audit row records that a deletion happened — it holds no child PII content).
export async function deleteStudentData(
  studentId: string,
  schoolId: string,
  actorId: string | null
): Promise<DeleteResult | null> {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) return null;

  const [attendance, observations, submissions, files, invoices, payments, logins] =
    await prisma.$transaction([
      prisma.attendance.deleteMany({ where: { studentId, schoolId } }),
      prisma.observation.deleteMany({ where: { studentId, schoolId } }),
      prisma.submission.deleteMany({ where: { studentId, schoolId } }),
      prisma.fileRec.deleteMany({ where: { studentId, schoolId } }),
      prisma.invoice.deleteMany({ where: { studentId, schoolId } }),
      prisma.payment.deleteMany({ where: { studentId, schoolId } }),
      prisma.user.deleteMany({ where: { studentId, schoolId, role: "student" } }),
    ]);

  // Detach the child from any parent's studentIdsJson.
  const parents = await prisma.user.findMany({ where: { schoolId, role: "parent" } });
  for (const p of parents) {
    const ids: string[] = p.studentIdsJson ? JSON.parse(p.studentIdsJson) : [];
    if (ids.includes(studentId)) {
      await prisma.user.update({
        where: { id: p.id },
        data: { studentIdsJson: JSON.stringify(ids.filter((x) => x !== studentId)) },
      });
    }
  }

  await prisma.student.delete({ where: { id: studentId } });

  const result: DeleteResult = {
    attendance: attendance.count,
    observations: observations.count,
    submissions: submissions.count,
    files: files.count,
    invoices: invoices.count,
    payments: payments.count,
    loginRemoved: logins.count > 0,
  };
  await logAudit(
    actorId,
    "student_data_deleted",
    `${student.name} (${studentId}) — ${JSON.stringify(result)}`
  );
  return result;
}
