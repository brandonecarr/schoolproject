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
import {
  assignmentMax,
  rubricConfig,
  parseItems,
  parseQuizAnswers,
  autoScoreQuiz,
  itemIsAuto,
} from "@/lib/lms";
import { packByKey } from "@/lib/outcomes";
import { recordOutcomesForSubmission } from "@/lib/mastery";
import { deleteStudentData } from "@/lib/retention";
import { newTokenValue, tokenExpiry } from "@/lib/tokens";
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

// --- Assignments ---
// Type-aware create: the builder posts a `type` + a serialized `config` (quiz
// items / rubric criteria / check-off opts), optional targeting, an optional
// attached resource file, and the resubmission flag. Fan-out creates one
// Submission ("assigned") per targeted student.
export async function addAssignment(formData: FormData) {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;

  const type = String(formData.get("type") || "written");
  const configJson = String(formData.get("config") || "");
  const flatPoints = Number(formData.get("points")) || 20;
  const points = assignmentMax(type, configJson, flatPoints);

  // Optional teacher-attached resource (image/PDF, stored in the DB, no student).
  let resourceFileId: string | null = null;
  const res = formData.get("resource") as File | null;
  if (res && res.size > 0 && ALLOWED[res.type] && res.size <= 8 * 1024 * 1024) {
    const buf = Buffer.from(await res.arrayBuffer());
    const rec = await prisma.fileRec.create({
      data: {
        schoolId,
        studentId: null,
        label: res.name || "Resource",
        ext: ALLOWED[res.type],
        mime: res.type,
        bytes: buf.length,
        data: buf,
        capturedAt: new Date().toISOString(),
      },
    });
    resourceFileId = rec.id;
  }

  const a = await prisma.assignment.create({
    data: {
      schoolId,
      courseId: String(formData.get("courseId")),
      title: String(formData.get("title") || ""),
      instructions: String(formData.get("instructions") || ""),
      dueDate: String(formData.get("dueDate") || today()),
      assignedAt: String(formData.get("assignedAt") || ""),
      points,
      type,
      configJson,
      resourceFileId,
    },
  });

  // Standards this work demonstrates (CSV of outcome ids from the builder).
  const outcomeIds = String(formData.get("outcomes") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const outcomeId of outcomeIds) {
    await prisma.outcomeAlignment.create({
      data: { schoolId, outcomeId, assignmentId: a.id, criterionId: null },
    });
  }

  // Targeting: "*" (or empty) = whole class; otherwise a CSV of student ids.
  const targets = String(formData.get("students") || "*").trim();
  const students =
    targets === "*" || targets === ""
      ? await prisma.student.findMany({ where: { schoolId } })
      : await prisma.student.findMany({
          where: { schoolId, id: { in: targets.split(",").filter(Boolean) } },
        });
  for (const s of students) {
    await prisma.submission.create({
      data: { schoolId, assignmentId: a.id, studentId: s.id, status: "assigned" },
    });
  }

  await logAudit(user.id, "assignment_created", `${type}: ${a.title} → ${students.length}`);
  revalidatePath("/assignments");
  redirect(`/assignments?created=${students.length}`);
}

// --- Grading (type-aware) ---
// rubric → sum the per-criterion scores (and record them on the submission);
// quiz   → keep the auto-graded points and add the teacher's short-answer points;
// else   → a single score. Feedback is common to all.
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export async function saveGrade(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const sub = await prisma.submission.findFirst({ where: { id, schoolId: school!.id } });
  if (!sub) redirect("/grading");
  const asg = await prisma.assignment.findUnique({ where: { id: sub.assignmentId } });
  if (!asg) redirect("/grading");

  let score = 0;
  let rubricJson: string | undefined;
  if (asg.type === "rubric") {
    const { criteria } = rubricConfig(asg.configJson);
    const scores = criteria.map((c) => ({
      critId: c.id,
      score: clamp(Number(formData.get(`rc_${c.id}`)) || 0, 0, c.max),
    }));
    score = scores.reduce((n, s) => n + s.score, 0);
    rubricJson = JSON.stringify({ rubric: scores });
  } else if (asg.type === "quiz") {
    const items = parseItems(asg.configJson);
    const answers = parseQuizAnswers(sub.answersJson);
    const { auto } = autoScoreQuiz(items, answers);
    const manual = items
      .filter((it) => !itemIsAuto(it))
      .reduce((n, it) => n + clamp(Number(formData.get(`sq_${it.id}`)) || 0, 0, it.points), 0);
    score = auto + manual;
  } else {
    score = Number(formData.get("score")) || 0;
  }

  await prisma.submission.update({
    where: { id },
    data: {
      status: "graded",
      score,
      feedback: String(formData.get("feedback") || ""),
      gradedAt: new Date().toISOString(),
      returnedAt: null,
      revisionNote: "",
      ...(rubricJson ? { answersJson: rubricJson } : {}),
    },
  });

  // Every score write is auditable, wherever it came from.
  if (sub.score !== score) {
    await prisma.gradeChange.create({
      data: {
        schoolId: school!.id,
        submissionId: id,
        studentId: sub.studentId,
        assignmentId: sub.assignmentId,
        oldScore: sub.score,
        newScore: score,
        changedById: user.id,
        changedByName: user.name,
        reason: "Graded in the grading queue",
        at: new Date().toISOString(),
      },
    });
  }

  // Standards mastery accrues automatically from graded work.
  await recordOutcomesForSubmission({
    schoolId: school!.id,
    studentId: sub.studentId,
    assignmentId: asg.id,
    submissionId: id,
    score,
    possible: asg.points,
  });

  await logAudit(user.id, "graded", id);
  revalidatePath("/grading");
  revalidatePath("/dashboard");
  revalidatePath("/student");
  revalidatePath("/mastery");
  revalidatePath("/gradebook");
  redirect("/grading?graded=1");
}

// Send a submission back for revision with a note. The student sees the note and
// can turn it in again (their earlier response is preserved as the starting point).
export async function returnSubmission(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const sub = await prisma.submission.findFirst({ where: { id, schoolId: school!.id } });
  if (!sub) redirect("/grading");
  await prisma.submission.update({
    where: { id },
    data: {
      status: "returned",
      returnedAt: new Date().toISOString(),
      revisionNote: String(formData.get("note") || "").slice(0, 500),
    },
  });
  await logAudit(user.id, "submission_returned", id);
  revalidatePath("/grading");
  revalidatePath("/student");
  redirect("/grading?returned=1");
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
      standards: e.standards,
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
    standards: e.standards,
  });
  await prisma.invoice.update({
    where: { id },
    data: { narrative: nar.text, narrativeSource: nar.source, evidenceScore: e.score },
  });
  await logAudit(user.id, "narrative_regenerated", id);
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}?regenerated=1`);
}

// --- Invites + password reset (tokenized links, no shared password) ---
// Generate a one-time invite link. The parent opens it and sets their OWN
// password (replaces the old shared demo1234). Verifiable consent is preserved:
// the parent still creates the child's login themselves from their portal.
export async function createParentInvite(formData: FormData) {
  const { user, school } = await requireTeacher();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect("/invites?exists=1");
  const token = newTokenValue();
  await prisma.token.create({
    data: {
      token,
      type: "parent_invite",
      schoolId: school!.id,
      email,
      name: String(formData.get("name") || ""),
      studentId: String(formData.get("studentId")),
      expiresAt: tokenExpiry(14),
    },
  });
  await logAudit(user.id, "parent_invite_created", email);
  revalidatePath("/invites");
  redirect(`/invites?invite=${token}`);
}

// Generate a one-time password-reset link for an existing account (parent or
// student). The owner shares it out-of-band; the user sets a new password.
export async function generateResetLink(formData: FormData) {
  const { user, school } = await requireTeacher();
  const userId = String(formData.get("userId"));
  const target = await prisma.user.findFirst({ where: { id: userId, schoolId: school!.id } });
  if (!target) redirect("/invites");
  const token = newTokenValue();
  await prisma.token.create({
    data: { token, type: "password_reset", schoolId: school!.id, userId, expiresAt: tokenExpiry(2) },
  });
  await logAudit(user.id, "reset_link_created", target.email);
  revalidatePath("/invites");
  redirect(`/invites?reset=${token}`);
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

// --- Add a single student (roster record, NOT a login) ---
// This creates the school's educational record for a child. It is deliberately
// separate from the child's login: the login is created later by the verified
// parent (createStudentAccount), which is what makes COPPA consent verifiable.
export async function addStudent(formData: FormData) {
  const { user, school } = await requireTeacher();
  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/students?added=0");

  const programKey = String(formData.get("esaProgram") || "").toUpperCase();
  const program = programKey && PROGRAMS[programKey] ? programKey : null;

  const student = await prisma.student.create({
    data: {
      schoolId: school!.id,
      name,
      grade: String(formData.get("grade") || "").trim(),
      familyName:
        String(formData.get("familyName") || "").trim() ||
        name.split(" ").slice(-1)[0] ||
        name,
      esaProgram: program,
      esaAmount: Number(formData.get("esaAmount")) || 0,
      tuitionAnnual: Number(formData.get("tuitionAnnual")) || school!.esaAmount || 0,
    },
  });
  await logAudit(user.id, "student_added", `${name} (${student.id})`);
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/invites");
  redirect("/students?added=1");
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

// --- Data governance (COPPA) ---
// Hard-delete a student and everything tied to them (right to deletion).
export async function deleteStudent(formData: FormData) {
  const { user, school } = await requireTeacher();
  const studentId = String(formData.get("studentId"));
  await deleteStudentData(studentId, school!.id, user.id);
  revalidatePath("/students");
  revalidatePath("/dashboard");
  redirect("/students?deleted=1");
}

// Set the retention window that governs the nightly purge.
export async function updateRetention(formData: FormData) {
  const { user, school } = await requireTeacher();
  const days = Math.max(1, Math.min(3650, Number(formData.get("retentionDays")) || 730));
  await prisma.school.update({ where: { id: school!.id }, data: { retentionDays: days } });
  await logAudit(user.id, "retention_updated", `${days} days`);
  revalidatePath("/settings");
  redirect("/settings?saved=1");
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

// --- Gradebook ---
// One bulk save for the whole grid. Only cells whose value actually changed are
// written, and every one of those writes a GradeChange row: grades are the part
// of the record most likely to be questioned later, so they get a defensible
// history (who, when, from what, to what, why).
//
// A blank cell means "leave this alone", never "erase the grade" — a bulk form
// must not be able to wipe a term's marks by accident.
export async function saveGradebook(formData: FormData) {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;
  const reason = String(formData.get("reason") || "").trim().slice(0, 200);
  const now = new Date().toISOString();

  // Collect submitted cells: score_<submissionId>
  const edits: { submissionId: string; raw: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("score_")) {
      edits.push({ submissionId: key.slice(6), raw: String(value).trim() });
    }
  }
  if (edits.length === 0) redirect("/gradebook");

  const subs = await prisma.submission.findMany({
    where: { schoolId, id: { in: edits.map((e) => e.submissionId) } },
  });
  const asgIds = [...new Set(subs.map((s) => s.assignmentId))];
  const assignments = await prisma.assignment.findMany({ where: { id: { in: asgIds } } });

  let changed = 0;
  for (const e of edits) {
    if (e.raw === "") continue; // blank = unchanged
    const sub = subs.find((s) => s.id === e.submissionId);
    if (!sub) continue;
    const asg = assignments.find((a) => a.id === sub.assignmentId);
    if (!asg) continue;

    const next = clamp(Math.round(Number(e.raw)), 0, asg.points);
    if (Number.isNaN(next)) continue;
    if (sub.score === next && sub.status === "graded") continue; // no-op

    await prisma.submission.update({
      where: { id: sub.id },
      data: {
        score: next,
        status: "graded",
        gradedAt: now,
        returnedAt: null,
        revisionNote: "",
      },
    });
    await prisma.gradeChange.create({
      data: {
        schoolId,
        submissionId: sub.id,
        studentId: sub.studentId,
        assignmentId: sub.assignmentId,
        oldScore: sub.score,
        newScore: next,
        changedById: user.id,
        changedByName: user.name,
        reason,
        at: now,
      },
    });
    // Keep standards mastery in step with the corrected grade.
    await recordOutcomesForSubmission({
      schoolId,
      studentId: sub.studentId,
      assignmentId: sub.assignmentId,
      submissionId: sub.id,
      score: next,
      possible: asg.points,
    });
    changed++;
  }

  await logAudit(user.id, "gradebook_saved", `${changed} grade${changed === 1 ? "" : "s"} changed`);
  revalidatePath("/gradebook");
  revalidatePath("/dashboard");
  revalidatePath("/grading");
  revalidatePath("/mastery");
  redirect(`/gradebook?saved=${changed}`);
}

// --- Standards / learning outcomes ---
// Outcomes are the standards this school teaches to. Aligning work to them and
// recording results is what turns teaching into "demonstrated progress against
// standards" — the strongest evidence an ESA reviewer can be handed.
export async function addOutcome(formData: FormData) {
  const { user, school } = await requireTeacher();
  const code = String(formData.get("code") || "").trim();
  const title = String(formData.get("title") || "").trim();
  if (!title) redirect("/outcomes?err=title");

  await prisma.outcome.create({
    data: {
      schoolId: school!.id,
      code: code || title.slice(0, 12).toUpperCase(),
      title,
      description: String(formData.get("description") || "").trim(),
      subject: String(formData.get("subject") || "").trim(),
      gradeBand: String(formData.get("gradeBand") || "").trim(),
      source: "custom",
    },
  });
  await logAudit(user.id, "outcome_added", `${code} ${title}`);
  revalidatePath("/outcomes");
  revalidatePath("/mastery");
  redirect("/outcomes?added=1");
}

export async function deleteOutcome(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const o = await prisma.outcome.findFirst({ where: { id, schoolId: school!.id } });
  if (o) {
    // Remove the outcome and everything hanging off it.
    await prisma.outcomeResult.deleteMany({ where: { outcomeId: id, schoolId: school!.id } });
    await prisma.outcomeAlignment.deleteMany({ where: { outcomeId: id, schoolId: school!.id } });
    await prisma.outcome.delete({ where: { id } });
    await logAudit(user.id, "outcome_deleted", `${o.code} ${o.title}`);
  }
  revalidatePath("/outcomes");
  revalidatePath("/mastery");
  redirect("/outcomes?deleted=1");
}

// Copy a starter pack into this school. Skips codes that already exist so the
// action is safe to run twice.
export async function importOutcomePack(formData: FormData) {
  const { user, school } = await requireTeacher();
  const key = String(formData.get("packKey") || "");
  const pack = packByKey(key);
  if (!pack) redirect("/outcomes");

  const existing = await prisma.outcome.findMany({
    where: { schoolId: school!.id },
    select: { code: true },
  });
  const have = new Set(existing.map((o) => o.code));

  let added = 0;
  for (const o of pack.outcomes) {
    if (have.has(o.code)) continue;
    await prisma.outcome.create({
      data: {
        schoolId: school!.id,
        code: o.code,
        title: o.title,
        description: o.description || "",
        subject: pack.subject,
        gradeBand: pack.gradeBand,
        source: `pack:${pack.key}`,
      },
    });
    added++;
  }
  await logAudit(user.id, "outcome_pack_imported", `${pack.key}: ${added} added`);
  revalidatePath("/outcomes");
  revalidatePath("/mastery");
  redirect(`/outcomes?imported=${added}`);
}

// Replace the set of standards an existing assignment demonstrates.
export async function setAssignmentOutcomes(formData: FormData) {
  const { user, school } = await requireTeacher();
  const assignmentId = String(formData.get("assignmentId"));
  const a = await prisma.assignment.findFirst({ where: { id: assignmentId, schoolId: school!.id } });
  if (!a) redirect("/assignments");

  const chosen = formData.getAll("outcomeId").map(String).filter(Boolean);
  await prisma.outcomeAlignment.deleteMany({ where: { assignmentId, schoolId: school!.id } });
  for (const outcomeId of chosen) {
    await prisma.outcomeAlignment.create({
      data: { schoolId: school!.id, outcomeId, assignmentId, criterionId: null },
    });
  }
  await logAudit(user.id, "assignment_outcomes_set", `${a.title}: ${chosen.length}`);
  revalidatePath("/assignments");
  revalidatePath("/mastery");
  redirect("/assignments?aligned=1");
}

// Record (or correct) a mastery result by hand from the mastery board — for
// evidence a teacher observed off-platform.
export async function recordOutcomeResult(formData: FormData) {
  const { user, school } = await requireTeacher();
  const studentId = String(formData.get("studentId"));
  const outcomeId = String(formData.get("outcomeId"));
  const level = Number(formData.get("level")); // 0..1
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: school!.id } });
  const outcome = await prisma.outcome.findFirst({ where: { id: outcomeId, schoolId: school!.id } });
  if (!student || !outcome || Number.isNaN(level)) redirect("/mastery");

  const pct = Math.max(0, Math.min(1, level));
  await prisma.outcomeResult.create({
    data: {
      schoolId: school!.id,
      studentId,
      outcomeId,
      score: pct * 100,
      possible: 100,
      mastered: pct >= (school!.masteryThreshold ?? 0.8),
      source: "manual",
      recordedAt: new Date().toISOString(),
    },
  });
  await logAudit(user.id, "outcome_result_manual", `${student.name} · ${outcome.code} · ${Math.round(pct * 100)}%`);
  revalidatePath("/mastery");
  revalidatePath(`/students/${studentId}`);
  redirect("/mastery?recorded=1");
}

// --- Worksheets (reusable question sets) ---
// A worksheet is built once, then printed (worksheets/[id]/print) or assigned
// digitally (spawns a quiz-type Assignment from the same items).
export async function createWorksheet(formData: FormData) {
  const { user, school } = await requireTeacher();
  const ws = await prisma.worksheet.create({
    data: {
      schoolId: school!.id,
      title: String(formData.get("title") || "Untitled worksheet"),
      subject: String(formData.get("subject") || ""),
      instructions: String(formData.get("instructions") || ""),
      itemsJson: String(formData.get("items") || "[]"),
    },
  });
  await logAudit(user.id, "worksheet_created", ws.title);
  revalidatePath("/worksheets");
  redirect(`/worksheets/${ws.id}`);
}

export async function deleteWorksheet(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const ws = await prisma.worksheet.findFirst({ where: { id, schoolId: school!.id } });
  if (ws) {
    await prisma.worksheet.delete({ where: { id } });
    await logAudit(user.id, "worksheet_deleted", id);
  }
  revalidatePath("/worksheets");
  redirect("/worksheets");
}

// Turn a worksheet into a live, digital quiz assignment and fan it out.
export async function assignWorksheet(formData: FormData) {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;
  const id = String(formData.get("worksheetId"));
  const ws = await prisma.worksheet.findFirst({ where: { id, schoolId } });
  if (!ws) redirect("/worksheets");

  const a = await prisma.assignment.create({
    data: {
      schoolId,
      courseId: String(formData.get("courseId")),
      title: ws.title,
      instructions: ws.instructions,
      dueDate: String(formData.get("dueDate") || today()),
      assignedAt: String(formData.get("assignedAt") || ""),
      points: assignmentMax("quiz", ws.itemsJson, 20),
      type: "quiz",
      configJson: ws.itemsJson,
    },
  });

  // Targeting: checked students, or the whole class when none are checked.
  const chosen = formData.getAll("stu").map(String).filter(Boolean);
  const students = chosen.length
    ? await prisma.student.findMany({ where: { schoolId, id: { in: chosen } } })
    : await prisma.student.findMany({ where: { schoolId } });
  for (const s of students) {
    await prisma.submission.create({
      data: { schoolId, assignmentId: a.id, studentId: s.id, status: "assigned" },
    });
  }

  await logAudit(user.id, "worksheet_assigned", `${ws.title} → ${students.length}`);
  revalidatePath("/assignments");
  redirect(`/assignments?created=${students.length}`);
}
