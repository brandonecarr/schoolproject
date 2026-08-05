"use server";

// All teacher-console mutations. Every action re-verifies auth via
// requireTeacher() (the Next 16 docs stress checking auth inside each action,
// since actions are directly POST-reachable) and scopes writes to the caller's
// school. Ported from the POST routes in the MVP's server.js.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireTeacher, logAudit } from "@/lib/auth";
import { evidenceFor } from "@/lib/evidence";
import { purposeNarrative } from "@/lib/ai";
import { PROGRAMS } from "@/lib/rules";
import { today, periodStart } from "@/lib/dates";

// --- Attendance ---
export async function saveAttendance(formData: FormData) {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;
  const date = String(formData.get("date") || today());
  const students = await prisma.student.findMany({ where: { schoolId } });

  for (const s of students) {
    const status = String(formData.get(`s_${s.id}`) || "present");
    const row = await prisma.attendance.findFirst({ where: { studentId: s.id, date } });
    if (row) await prisma.attendance.update({ where: { id: row.id }, data: { status } });
    else await prisma.attendance.create({ data: { schoolId, studentId: s.id, date, status, note: "" } });
  }
  await logAudit(user.id, "attendance_saved", date);
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  redirect(`/attendance?date=${date}&saved=1`);
}

// --- Observations ---
export async function addObservation(formData: FormData) {
  const { user, school } = await requireTeacher();
  await prisma.observation.create({
    data: {
      schoolId: school!.id,
      studentId: String(formData.get("studentId")),
      date: String(formData.get("date") || today()),
      text: String(formData.get("text") || ""),
      author: user.name,
    },
  });
  revalidatePath("/observations");
  redirect("/observations");
}

// --- Courses ---
export async function addCourse(formData: FormData) {
  const { school } = await requireTeacher();
  await prisma.course.create({
    data: {
      schoolId: school!.id,
      name: String(formData.get("name") || ""),
      subject: String(formData.get("subject") || ""),
    },
  });
  revalidatePath("/courses");
  redirect("/courses");
}

// --- Assignments (assigns to every student on create) ---
export async function addAssignment(formData: FormData) {
  const { school } = await requireTeacher();
  const schoolId = school!.id;
  const a = await prisma.assignment.create({
    data: {
      schoolId,
      courseId: String(formData.get("courseId")),
      title: String(formData.get("title") || ""),
      instructions: String(formData.get("instructions") || ""),
      dueDate: String(formData.get("dueDate") || today()),
      points: Number(formData.get("points")) || 20,
    },
  });
  const students = await prisma.student.findMany({ where: { schoolId } });
  for (const s of students) {
    await prisma.submission.create({
      data: { schoolId, assignmentId: a.id, studentId: s.id, status: "assigned" },
    });
  }
  revalidatePath("/assignments");
  redirect("/assignments?created=1");
}

// --- Grading ---
export async function saveGrade(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const sub = await prisma.submission.findFirst({ where: { id, schoolId: school!.id } });
  if (!sub) redirect("/grading");
  await prisma.submission.update({
    where: { id },
    data: {
      status: "graded",
      score: Number(formData.get("score")),
      feedback: String(formData.get("feedback") || ""),
      gradedAt: new Date().toISOString(),
    },
  });
  await logAudit(user.id, "graded", id);
  revalidatePath("/grading");
  revalidatePath("/dashboard");
  redirect("/grading?graded=1");
}

// --- Invoices ---
// AI drafts the narrative; a human reviews and submits. Nothing is transmitted
// anywhere (COHORT-HANDOFF §4.1).
export async function buildInvoices() {
  const { user, school, rail } = await requireTeacher();
  const schoolId = school!.id;
  const start = periodStart();
  const end = today();
  const students = await prisma.student.findMany({ where: { schoolId, NOT: { esaProgram: null } } });

  // Dedup: skip students who already have an OPEN invoice for this exact period.
  // "Open" = anything not yet resolved (draft/submitted/approved) or already
  // paid — building again would only duplicate it. A rejected invoice is not
  // open, so a rebuild is allowed as one way to redo a rejection.
  const existing = await prisma.invoice.findMany({
    where: {
      schoolId,
      periodStart: start,
      periodEnd: end,
      status: { in: ["draft", "submitted", "approved", "paid"] },
    },
    select: { studentId: true },
  });
  const covered = new Set(existing.map((i) => i.studentId));

  let built = 0;
  let skipped = 0;
  for (const s of students) {
    if (covered.has(s.id)) {
      skipped++;
      continue;
    }
    const e = await evidenceFor(s.id, start, end);
    const nar = await purposeNarrative({
      student: s,
      school: school!,
      rail,
      period: { start, end },
      attendance: e.attendance,
      assignments: e.assignments,
      submissions: e.submissions,
      observations: e.observations,
    });
    await prisma.invoice.create({
      data: {
        schoolId,
        studentId: s.id,
        periodStart: start,
        periodEnd: end,
        amount: Math.round((s.esaAmount || 0) / 10),
        status: "draft",
        narrative: nar.text,
        narrativeSource: nar.source,
        evidenceScore: e.score,
        railId: rail ? rail.id : null,
      },
    });
    built++;
  }
  await logAudit(user.id, "invoices_built", `${built} built, ${skipped} skipped`);
  revalidatePath("/invoices");
  revalidatePath("/cashflow");
  redirect(`/invoices?built=${built}&skipped=${skipped}`);
}

export async function saveNarrative(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const inv = await prisma.invoice.findFirst({ where: { id, schoolId: school!.id } });
  if (!inv) redirect("/invoices");
  await prisma.invoice.update({
    where: { id },
    data: { narrative: String(formData.get("narrative") || ""), narrativeSource: "edited" },
  });
  await logAudit(user.id, "narrative_edited", id);
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}`);
}

// Move an invoice forward through the reimbursement lifecycle:
//   draft → submitted → approved → paid   (and resubmit: rejected → submitted)
export async function setInvoiceStatus(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const inv = await prisma.invoice.findFirst({ where: { id, schoolId: school!.id } });
  if (!inv) redirect("/invoices");
  const now = new Date().toISOString();
  const data: {
    status: string;
    submittedAt?: string;
    approvedAt?: string;
    paidAt?: string;
  } = { status };
  if (status === "submitted") data.submittedAt = now; // covers first submit AND resubmit
  if (status === "approved") data.approvedAt = now;
  if (status === "paid") data.paidAt = now;
  await prisma.invoice.update({ where: { id }, data });
  await logAudit(user.id, "invoice_status", `${id} → ${status}`);
  revalidatePath("/invoices");
  revalidatePath("/cashflow");
  revalidatePath("/dashboard");
  redirect(`/invoices/${id}`);
}

// Reject an invoice with a reason. Increments rejectionCount so the first-pass
// approval-rate metric can tell a clean approval from a reworked one.
export async function rejectInvoice(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") || "").trim();
  const inv = await prisma.invoice.findFirst({ where: { id, schoolId: school!.id } });
  if (!inv) redirect("/invoices");
  await prisma.invoice.update({
    where: { id },
    data: {
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason || "No reason recorded",
      rejectionCount: { increment: 1 },
    },
  });
  await logAudit(user.id, "invoice_rejected", `${id}: ${reason}`);
  revalidatePath("/invoices");
  revalidatePath("/cashflow");
  redirect(`/invoices/${id}`);
}

// Rebuild the educational-purpose narrative from the latest evidence — the
// "regenerate documentation" step of the rejection rework loop. Leaves the
// status alone (the teacher resubmits after reviewing the fresh draft).
export async function regenerateNarrative(formData: FormData) {
  const { user, school, rail } = await requireTeacher();
  const id = String(formData.get("id"));
  const inv = await prisma.invoice.findFirst({ where: { id, schoolId: school!.id } });
  if (!inv) redirect("/invoices");
  const student = await prisma.student.findUnique({ where: { id: inv.studentId } });
  if (!student) redirect("/invoices");

  const e = await evidenceFor(inv.studentId, inv.periodStart, inv.periodEnd);
  const nar = await purposeNarrative({
    student,
    school: school!,
    rail,
    period: { start: inv.periodStart, end: inv.periodEnd },
    attendance: e.attendance,
    assignments: e.assignments,
    submissions: e.submissions,
    observations: e.observations,
  });
  await prisma.invoice.update({
    where: { id },
    data: { narrative: nar.text, narrativeSource: nar.source, evidenceScore: e.score },
  });
  await logAudit(user.id, "narrative_regenerated", id);
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}?regenerated=1`);
}

// --- Invites (parent account creation) ---
export async function createParentInvite(formData: FormData) {
  const { school } = await requireTeacher();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect("/invites");
  await prisma.user.create({
    data: {
      schoolId: school!.id,
      role: "parent",
      name: String(formData.get("name") || ""),
      email,
      password: (await import("@/lib/password")).hashPassword("demo1234"),
      studentIdsJson: JSON.stringify([String(formData.get("studentId"))]),
      consentGivenAt: new Date().toISOString(),
    },
  });
  revalidatePath("/invites");
  redirect("/invites?invited=1");
}

// --- Tuition ---
export async function recordPayment(formData: FormData) {
  const { user, school } = await requireTeacher();
  await prisma.payment.create({
    data: {
      schoolId: school!.id,
      studentId: String(formData.get("studentId")),
      payer: "family",
      amount: Number(formData.get("amount")) || 0,
      receivedAt: new Date().toISOString(),
      method: "manual",
    },
  });
  await logAudit(user.id, "payment_recorded", String(formData.get("studentId")));
  revalidatePath("/billing");
  redirect("/billing?paid=1");
}

// --- Roster CSV import ---
// Columns: name, grade, familyName, esaProgram, esaAmount, tuitionAnnual.
// Only `name` is required; a header row (first cell "name") is skipped.
export async function importStudents(formData: FormData) {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;
  const raw = String(formData.get("csv") || "");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let created = 0;
  let skipped = 0;
  for (const line of lines) {
    const cols = line.split(",").map((c) => c.trim());
    const name = cols[0] || "";
    if (!name) {
      skipped++;
      continue;
    }
    if (name.toLowerCase() === "name") continue; // header row

    const [, grade, familyName, esaProgram, esaAmount, tuitionAnnual] = cols;
    const programKey = (esaProgram || "").toUpperCase();
    const program = programKey && PROGRAMS[programKey] ? programKey : null;

    await prisma.student.create({
      data: {
        schoolId,
        name,
        grade: grade || "",
        familyName: familyName || name.split(" ").slice(-1)[0] || name,
        esaProgram: program,
        esaAmount: Number(esaAmount) || 0,
        tuitionAnnual: Number(tuitionAnnual) || school!.esaAmount || 0,
      },
    });
    created++;
  }

  await logAudit(user.id, "students_imported", `${created} created, ${skipped} skipped`);
  revalidatePath("/students");
  revalidatePath("/dashboard");
  redirect(`/students?imported=${created}&skipped=${skipped}`);
}

// --- Work samples (multipart upload; bytes stored in the DB) ---
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function uploadSample(formData: FormData) {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;
  const studentId = String(formData.get("studentId"));
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) redirect("/students");

  const file = formData.get("file") as File | null;
  const back = `/students/${studentId}`;
  if (!file || file.size === 0) redirect(`${back}?upload=empty`);
  const ext = ALLOWED[file.type];
  if (!ext) redirect(`${back}?upload=type`);
  if (file.size > 8 * 1024 * 1024) redirect(`${back}?upload=big`);

  const buf = Buffer.from(await file.arrayBuffer());
  await prisma.fileRec.create({
    data: {
      schoolId,
      studentId,
      label: String(formData.get("label") || file.name || "Student work").slice(0, 120),
      ext,
      mime: file.type,
      bytes: buf.length,
      data: buf,
      capturedAt: new Date().toISOString(),
    },
  });
  await logAudit(user.id, "work_sample_added", `${studentId}`);
  revalidatePath(back);
  redirect(`${back}?upload=ok`);
}

export async function deleteSample(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const studentId = String(formData.get("studentId"));
  const f = await prisma.fileRec.findFirst({ where: { id, schoolId: school!.id } });
  if (f) {
    await prisma.fileRec.delete({ where: { id } });
    await logAudit(user.id, "work_sample_deleted", id);
  }
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}`);
}
