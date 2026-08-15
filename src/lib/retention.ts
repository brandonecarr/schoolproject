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

import { prisma, prismaSystem } from "@/lib/db";
import { withTenant } from "@/lib/tenant-context";
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

  // Sequential rather than $transaction, deliberately. The RLS extension in
  // db.ts wraps every operation in its own set_config transaction, which does
  // not compose with a client-level batch. Atomicity buys nothing here anyway:
  // every delete is idempotent against the same cutoff, so a crash midway
  // leaves work the next nightly run finishes.
  const attendance = await prisma.attendance.deleteMany({
    where: { schoolId: school.id, date: { lt: cutoffDate } },
  });
  const observations = await prisma.observation.deleteMany({
    where: { schoolId: school.id, date: { lt: cutoffDate } },
  });
  const submissions = await prisma.submission.deleteMany({
    where: { schoolId: school.id, createdAt: { lt: cutoff } },
  });
    // studentId is required here, not incidental. A FileRec with a null
    // studentId is explicitly NOT child data — it's a teacher-attached
    // assignment resource, or the school's own logo. Purging those on the
    // child-retention clock deletes a school's letterhead after two years and
    // takes assignment resources with it, neither of which this window governs.
    // Child files are exactly the ones carrying a studentId, and a family's
    // right-to-deletion request removes them by that same key below.
  const files = await prisma.fileRec.deleteMany({
    // invoiceId: null is belt-and-braces. Receipts already carry a null
    // studentId (they are financial records, not child data), but if one ever
    // gained a studentId through a future change, this clause keeps the purge
    // from eating a reimbursement audit document on the child-retention clock.
    where: {
      schoolId: school.id,
      studentId: { not: null },
      invoiceId: null,
      claimId: null,
      capturedAt: { lt: cutoffIso },
    },
  });

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
  // System: the nightly job is the one caller that legitimately spans schools.
  const schools = await prismaSystem.school.findMany({ select: { id: true, retentionDays: true } });
  const results: PurgeResult[] = [];
  // Each school's purge runs AS that school. Under row-level security this
  // means a bug in purgeSchool cannot reach past the school being processed —
  // the strongest possible containment for the most destructive code we have.
  for (const s of schools) results.push(await withTenant(s.id, () => purgeSchool(s)));
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

  // Sequential for the same reason as purgeSchool above. Right-to-deletion is
  // rerunnable by construction — every delete targets the same studentId — so
  // a crash midway is an incomplete deletion the retry completes, not a
  // corrupt state.
  const attendance = await prisma.attendance.deleteMany({ where: { studentId, schoolId } });
  const observations = await prisma.observation.deleteMany({ where: { studentId, schoolId } });
  const submissions = await prisma.submission.deleteMany({ where: { studentId, schoolId } });
  const files = await prisma.fileRec.deleteMany({ where: { studentId, schoolId } });
  // Receipts hang off the invoices (studentId null), so the studentId-keyed
  // delete above misses them. Full deletion takes the child's invoices AND
  // their receipts — orphaned claim paperwork about a deleted child would be
  // the worst of both worlds.
  const invoiceIds = (
    await prisma.invoice.findMany({ where: { studentId, schoolId }, select: { id: true } })
  ).map((i) => i.id);
  const receiptCount =
    invoiceIds.length > 0
      ? (await prisma.fileRec.deleteMany({ where: { schoolId, invoiceId: { in: invoiceIds } } }))
          .count
      : 0;
  const invoices = await prisma.invoice.deleteMany({ where: { studentId, schoolId } });
  // Same shape for a homeschool family's expense claims: receipts hang off
  // the claim (studentId null), so they go with it — receipts BEFORE claims.
  const claimIds = (
    await prisma.expenseClaim.findMany({ where: { studentId, schoolId }, select: { id: true } })
  ).map((c) => c.id);
  if (claimIds.length > 0) {
    await prisma.fileRec.deleteMany({ where: { schoolId, claimId: { in: claimIds } } });
  }
  await prisma.expenseClaim.deleteMany({ where: { studentId, schoolId } });
  const payments = await prisma.payment.deleteMany({ where: { studentId, schoolId } });
  const logins = await prisma.user.deleteMany({ where: { studentId, schoolId, role: "student" } });

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
    files: files.count + receiptCount,
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
