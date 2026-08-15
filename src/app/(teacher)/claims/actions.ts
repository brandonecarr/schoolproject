"use server";

// Expense claims — the homeschool family's money surface. Every action gates
// on requireTeacher() AND refuses unless the tenant is a family: a school
// invoices instead, and must never grow a second, parallel ledger. Cohort
// prepares the packet; the family submits it in the state portal themselves.
// Nothing here transmits anything anywhere.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireTeacher, logAudit } from "@/lib/auth";
import { isFamily } from "@/lib/kind";
import {
  parseCategory,
  parseYmd,
  parseAmount,
  parseClaimStatus,
  claimWindow,
} from "@/lib/claims";
import { evidenceFor } from "@/lib/evidence";
import { claimNarrative } from "@/lib/ai";
import { recordRailObservation } from "@/lib/observe";
import { today } from "@/lib/dates";
import { RAILS } from "@/lib/rules";

const RECEIPT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** The gate every claim action shares: a teacher, at a FAMILY tenant. */
async function requireFamily() {
  const session = await requireTeacher();
  if (!isFamily(session.school)) redirect("/dashboard");
  return session;
}

/** Draft the purpose statement from the records around the purchase. */
async function draftPurpose(
  claim: {
    studentId: string;
    title: string;
    vendor: string;
    category: string;
    amount: number;
    purchaseDate: string;
    windowStart: string;
    windowEnd: string;
    railId: string | null;
  },
  school: { name: string; state: string }
) {
  const [child, e] = await Promise.all([
    prisma.student.findUnique({ where: { id: claim.studentId } }),
    evidenceFor(claim.studentId, claim.windowStart, claim.windowEnd),
  ]);
  const rail = claim.railId ? (RAILS[claim.railId] ?? null) : null;
  const nar = await claimNarrative({
    family: { name: school.name, state: school.state },
    child: { name: child?.name ?? "the child", grade: child?.grade ?? "" },
    rail: rail ? { label: rail.label, requires: rail.requires } : null,
    claim: {
      title: claim.title,
      vendor: claim.vendor,
      category: claim.category,
      amount: claim.amount,
      purchaseDate: claim.purchaseDate,
    },
    window: { start: claim.windowStart, end: claim.windowEnd },
    attendance: e.attendance,
    observations: e.observations,
    submissions: e.submissions,
    standards: e.standards,
  });
  return { nar, evidenceScore: e.score };
}

export async function createClaim(formData: FormData) {
  const { user, school, rail } = await requireFamily();
  const schoolId = school!.id;

  const studentId = String(formData.get("studentId") || "");
  const title = String(formData.get("title") || "").trim().slice(0, 140);
  const vendor = String(formData.get("vendor") || "").trim().slice(0, 100);
  const purchaseDate = parseYmd(formData.get("purchaseDate"));
  const amount = parseAmount(formData.get("amount"));
  const category = parseCategory(formData.get("category"));

  if (!studentId || !title) redirect("/claims?error=fields");
  if (!purchaseDate) redirect("/claims?error=date");
  if (amount == null) redirect("/claims?error=amount");

  // The child must be this family's. RLS backstops; the app check stays
  // primary so the failure is a clean redirect, not a silent empty write.
  const child = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!child) redirect("/claims?error=fields");

  const w = claimWindow(purchaseDate, today());
  const base = {
    studentId,
    title,
    vendor,
    category,
    amount,
    purchaseDate,
    windowStart: w.start,
    windowEnd: w.end,
    railId: rail?.id ?? null,
  };
  const { nar, evidenceScore } = await draftPurpose(base, school!);

  const created = await prisma.expenseClaim.create({
    data: {
      schoolId,
      ...base,
      purpose: nar.text,
      purposeSource: nar.source,
      evidenceScore,
      status: "draft",
    },
  });
  await logAudit(user.id, "claim_created", `${created.id}: ${title} $${amount}`);
  revalidatePath("/claims");
  redirect(`/claims/${created.id}?created=1`);
}

/** Save the parent's edit of the purpose statement (marks source "edited"). */
export async function saveClaimPurpose(formData: FormData) {
  const { user, school } = await requireFamily();
  const id = String(formData.get("id") || "");
  const purpose = String(formData.get("purpose") || "").trim().slice(0, 4000);
  const updated = await prisma.expenseClaim.updateMany({
    where: { id, schoolId: school!.id },
    data: { purpose, purposeSource: "edited" },
  });
  if (updated.count === 0) redirect("/claims");
  await logAudit(user.id, "claim_purpose_saved", id);
  revalidatePath(`/claims/${id}`);
  redirect(`/claims/${id}?saved=1`);
}

/** Redraft the purpose from the latest records — the rejection-rework step. */
export async function regenerateClaimPurpose(formData: FormData) {
  const { user, school } = await requireFamily();
  const id = String(formData.get("id") || "");
  const claim = await prisma.expenseClaim.findFirst({ where: { id, schoolId: school!.id } });
  if (!claim) redirect("/claims");
  const { nar, evidenceScore } = await draftPurpose(claim, school!);
  await prisma.expenseClaim.update({
    where: { id },
    data: { purpose: nar.text, purposeSource: nar.source, evidenceScore },
  });
  await logAudit(user.id, "claim_purpose_regenerated", id);
  revalidatePath(`/claims/${id}`);
  redirect(`/claims/${id}?regenerated=1`);
}

/**
 * Lifecycle: draft → submitted (the parent uploaded it in the portal) →
 * approved / paid. Rejection has its own action so the reason is captured.
 * The portal reference is the wallet's own claim/order number — the thing
 * a parent quotes when they call about it.
 */
export async function setClaimStatus(formData: FormData) {
  const { user, school } = await requireFamily();
  const id = String(formData.get("id") || "");
  const status = parseClaimStatus(formData.get("status"));
  if (!status || status === "rejected") redirect(`/claims/${id}`);
  const claim = await prisma.expenseClaim.findFirst({ where: { id, schoolId: school!.id } });
  if (!claim) redirect("/claims");

  const now = new Date().toISOString();
  const portalRef = String(formData.get("portalRef") || "").trim().slice(0, 80);
  await prisma.expenseClaim.update({
    where: { id },
    data: {
      status,
      ...(status === "submitted" ? { submittedAt: now, portalRef: portalRef || claim.portalRef } : {}),
      ...(status === "approved" ? { approvedAt: now } : {}),
      ...(status === "paid" ? { paidAt: now, approvedAt: claim.approvedAt ?? now } : {}),
    },
  });
  if (status === "approved" || status === "paid") {
    const child = await prisma.student.findUnique({
      where: { id: claim.studentId },
      select: { esaProgram: true },
    });
    await recordRailObservation({
      schoolId: school!.id,
      invoiceId: claim.id,
      railId: claim.railId,
      programCode: child?.esaProgram ?? null,
      outcome: status,
      recordedBy: user.id,
    });
  }
  await logAudit(user.id, `claim_${status}`, id);
  revalidatePath("/claims");
  revalidatePath(`/claims/${id}`);
  redirect(`/claims/${id}`);
}

export async function rejectClaim(formData: FormData) {
  const { user, school } = await requireFamily();
  const id = String(formData.get("id") || "");
  const filed = String(formData.get("reason") || "").trim();
  const verbatim = String(formData.get("reasonRaw") || "").trim();
  const claim = await prisma.expenseClaim.findFirst({ where: { id, schoolId: school!.id } });
  if (!claim) redirect("/claims");

  const shown = verbatim || filed || "No reason recorded";
  await prisma.expenseClaim.update({
    where: { id },
    data: {
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      rejectionReason: shown,
      rejectionCount: { increment: 1 },
    },
  });
  // Rejection learning stays cross-tenant: what a rail bounces for a family
  // is what it bounces for a school.
  const child = await prisma.student.findUnique({
    where: { id: claim.studentId },
    select: { esaProgram: true },
  });
  await recordRailObservation({
    schoolId: school!.id,
    invoiceId: claim.id,
    railId: claim.railId,
    programCode: child?.esaProgram ?? null,
    outcome: "rejected",
    reasonRaw: verbatim,
    reasonKey: filed,
    recordedBy: user.id,
  });
  await logAudit(user.id, "claim_rejected", `${id}: ${shown}`);
  revalidatePath("/claims");
  redirect(`/claims/${id}`);
}

export async function uploadClaimReceipt(formData: FormData) {
  const { user, school } = await requireFamily();
  const schoolId = school!.id;
  const claimId = String(formData.get("claimId") || "");
  const back = `/claims/${claimId}`;

  const claim = await prisma.expenseClaim.findFirst({ where: { id: claimId, schoolId } });
  if (!claim) redirect("/claims");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) redirect(`${back}?receipt=empty`);
  const ext = RECEIPT_TYPES[file.type];
  if (!ext) redirect(`${back}?receipt=type`);
  if (file.size > 4 * 1024 * 1024) redirect(`${back}?receipt=big`);

  const buf = Buffer.from(await file.arrayBuffer());
  await prisma.fileRec.create({
    data: {
      schoolId,
      // Null on purpose: studentId marks child data for the retention purge,
      // and a receipt is a financial record kept for reimbursement audit.
      studentId: null,
      claimId,
      label: (file.name || "receipt").slice(0, 120),
      ext,
      mime: file.type,
      bytes: buf.length,
      data: buf,
      capturedAt: new Date().toISOString(),
    },
  });
  await logAudit(user.id, "claim_receipt_uploaded", `${claimId}: ${buf.length} bytes`);
  revalidatePath(back);
  redirect(`${back}?receipt=ok`);
}

export async function removeClaimReceipt(formData: FormData) {
  const { user, school } = await requireFamily();
  const claimId = String(formData.get("claimId") || "");
  const fileId = String(formData.get("fileId") || "");
  // claimId: { not: null } — this can only ever remove a receipt, never a
  // work sample or the logo, whatever id is posted.
  const removed = await prisma.fileRec.deleteMany({
    where: { id: fileId, schoolId: school!.id, claimId: { not: null } },
  });
  if (removed.count > 0) await logAudit(user.id, "claim_receipt_removed", fileId);
  revalidatePath(`/claims/${claimId}`);
  redirect(`/claims/${claimId}?receipt=removed`);
}

export async function deleteClaim(formData: FormData) {
  const { user, school } = await requireFamily();
  const id = String(formData.get("id") || "");
  // Only a DRAFT can be deleted — anything that reached the portal is history.
  const claim = await prisma.expenseClaim.findFirst({
    where: { id, schoolId: school!.id, status: "draft" },
  });
  if (!claim) redirect(`/claims/${id}`);
  await prisma.fileRec.deleteMany({ where: { schoolId: school!.id, claimId: id } });
  await prisma.expenseClaim.delete({ where: { id } });
  await logAudit(user.id, "claim_deleted", id);
  revalidatePath("/claims");
  redirect("/claims?deleted=1");
}
