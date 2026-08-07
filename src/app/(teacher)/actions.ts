"use server";

// All teacher-console mutations. Every action re-verifies auth via
// requireTeacher() (the Next 16 docs stress checking auth inside each action,
// since actions are directly POST-reachable) and scopes writes to the caller's
// school. Ported from the POST routes in the MVP's server.js.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireTeacher, logAudit } from "@/lib/auth";
import { parseAccent } from "@/lib/branding";
import { evidenceFor } from "@/lib/evidence";
import { purposeNarrative, progressNarrative } from "@/lib/ai";
import { PROGRAMS } from "@/lib/rules";
import { recordRailObservation } from "@/lib/observe";
import {
  assignmentMax,
  rubricConfig,
  parseItems,
  parseQuizAnswers,
  autoScoreQuiz,
  itemIsAuto,
} from "@/lib/lms";
import { packByKey } from "@/lib/outcomes";
import { recordOutcomesForSubmission, masteryForStudent } from "@/lib/mastery";
import { notifyUsers, parentUserIdsFor, studentUserIdFor, familyUserIdsByRole } from "@/lib/notify";
import { excerpt } from "@/lib/announcements";
import { clamp01, isAnnotatable } from "@/lib/annotate";
import { parsePins, togglePin } from "@/lib/nav";
import { parseTime, generateSlots, withoutClashes } from "@/lib/conferences";
import { runMasteryPaths } from "@/lib/paths-run";
import { bandFor, describeBand, isSelfReferential } from "@/lib/paths";
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

  // A mastery path may now have work to hand this student.
  await runMasteryPaths({
    schoolId: school!.id,
    studentId: sub.studentId,
    assignmentId: asg.id,
    score,
    possible: asg.points,
  });

  // Tell the family it's been marked. Parents and students read this in
  // different places, so each gets a link that works for them.
  const gradedNote = {
    schoolId: school!.id,
    type: "graded" as const,
    title: `${asg.title} was graded`,
    body: `Scored ${score} out of ${asg.points}.`,
  };
  await notifyUsers(
    await parentUserIdsFor(sub.studentId, school!.id),
    { ...gradedNote, linkPath: "/parent/feed" },
    user.id
  );
  await notifyUsers(
    await studentUserIdFor(sub.studentId),
    { ...gradedNote, linkPath: "/student/work" },
    user.id
  );

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
  const rAsg = await prisma.assignment.findUnique({ where: { id: sub.assignmentId } });
  const returnedNote = {
    schoolId: school!.id,
    type: "returned" as const,
    title: `${rAsg?.title ?? "Work"} needs changes`,
    body: String(formData.get("note") || "Your teacher sent this back for revision."),
  };
  await notifyUsers(
    await parentUserIdsFor(sub.studentId, school!.id),
    { ...returnedNote, linkPath: "/parent/feed" },
    user.id
  );
  await notifyUsers(
    await studentUserIdFor(sub.studentId),
    { ...returnedNote, linkPath: "/student/work" },
    user.id
  );

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

  // Positive ground truth. Rejections teach us the taxonomy; payments are the
  // only thing that can honestly retire a rail's ⚑ verify flag.
  if (status === "approved" || status === "paid") {
    const student = await prisma.student.findUnique({
      where: { id: inv.studentId },
      select: { esaProgram: true },
    });
    await recordRailObservation({
      schoolId: school!.id,
      invoiceId: inv.id,
      railId: inv.railId,
      programCode: student?.esaProgram ?? null,
      outcome: status,
      recordedBy: user.id,
    });
  }

  await logAudit(user.id, "invoice_status", `${id} → ${status}`);
  revalidatePath("/invoices");
  revalidatePath("/cashflow");
  revalidatePath("/dashboard");
  redirect(`/invoices/${id}`);
}

// Reject an invoice with a reason. Increments rejectionCount so the first-pass
// approval-rate metric can tell a clean approval from a reworked one.
//
// Two fields, deliberately: `reason` is the taxonomy entry the teacher filed it
// under (may be empty when none of our guesses fit), and `reasonRaw` is what the
// portal actually said. The verbatim text is the asset — the preset list is what
// we're trying to learn, so collapsing a real rejection into "Other" would throw
// away the only ground truth we get.
export async function rejectInvoice(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const filed = String(formData.get("reason") || "").trim();
  const verbatim = String(formData.get("reasonRaw") || "").trim();
  const inv = await prisma.invoice.findFirst({ where: { id, schoolId: school!.id } });
  if (!inv) redirect("/invoices");

  // Prefer the portal's own wording in the summary a teacher reads later; fall
  // back to the filed category when she didn't paste anything.
  const shown = verbatim || filed || "No reason recorded";
  await prisma.invoice.update({
    where: { id },
    data: {
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      rejectionReason: shown,
      rejectionCount: { increment: 1 },
    },
  });

  const student = await prisma.student.findUnique({
    where: { id: inv.studentId },
    select: { esaProgram: true },
  });
  await recordRailObservation({
    schoolId: school!.id,
    invoiceId: inv.id,
    railId: inv.railId,
    programCode: student?.esaProgram ?? null,
    outcome: "rejected",
    reasonRaw: verbatim,
    reasonKey: filed,
    recordedBy: user.id,
  });

  await logAudit(user.id, "invoice_rejected", `${id}: ${shown}`);
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
  // Scoped to THIS school. The same parent may already have an account at a
  // different school — that is not a clash, and blocking it would leave the
  // teacher stuck with no way forward.
  const existing = await prisma.user.findUnique({
    where: { schoolId_email: { schoolId: school!.id, email } },
  });
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

// --- Mastery paths ---
export async function addPathRule(formData: FormData) {
  const { user, school } = await requireTeacher();
  const assignmentId = String(formData.get("assignmentId"));
  const thenAssignmentId = String(formData.get("thenAssignmentId"));
  if (!assignmentId || !thenAssignmentId) redirect("/paths?err=missing");
  if (isSelfReferential(assignmentId, thenAssignmentId)) redirect("/paths?err=self");

  const preset = String(formData.get("preset") || "below") as "below" | "atOrAbove" | "between";
  const a = Number(formData.get("a")) || 0;
  const b = Number(formData.get("b")) || 0;
  const { minPct, maxPct } = bandFor(preset, a, b);

  await prisma.pathRule.create({
    data: {
      schoolId: school!.id,
      assignmentId,
      minPct,
      maxPct,
      thenAssignmentId,
      note: String(formData.get("note") || "").slice(0, 300),
    },
  });
  await logAudit(user.id, "path_rule_added", `${assignmentId} ${minPct}-${maxPct} → ${thenAssignmentId}`);
  revalidatePath("/paths");
  redirect("/paths?added=1");
}

export async function deletePathRule(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const r = await prisma.pathRule.findFirst({ where: { id, schoolId: school!.id } });
  if (r) {
    await prisma.pathRule.delete({ where: { id } });
    await logAudit(user.id, "path_rule_deleted", id);
  }
  revalidatePath("/paths");
  redirect("/paths?deleted=1");
}

// --- Item banks (reusable questions) ---
export async function createItemBank(formData: FormData) {
  const { user, school } = await requireTeacher();
  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/banks?err=name");
  const bank = await prisma.itemBank.create({
    data: {
      schoolId: school!.id,
      name,
      subject: String(formData.get("subject") || ""),
      itemsJson: String(formData.get("items") || "[]"),
    },
  });
  await logAudit(user.id, "item_bank_created", name);
  revalidatePath("/banks");
  redirect(`/banks?created=${bank.id}`);
}

export async function updateItemBank(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const bank = await prisma.itemBank.findFirst({ where: { id, schoolId: school!.id } });
  if (!bank) redirect("/banks");
  await prisma.itemBank.update({
    where: { id },
    data: {
      name: String(formData.get("name") || bank.name),
      subject: String(formData.get("subject") || ""),
      itemsJson: String(formData.get("items") || bank.itemsJson),
    },
  });
  await logAudit(user.id, "item_bank_updated", id);
  revalidatePath("/banks");
  redirect("/banks?saved=1");
}

export async function deleteItemBank(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const bank = await prisma.itemBank.findFirst({ where: { id, schoolId: school!.id } });
  if (bank) {
    await prisma.itemBank.delete({ where: { id } });
    await logAudit(user.id, "item_bank_deleted", bank.name);
  }
  revalidatePath("/banks");
  redirect("/banks?deleted=1");
}

// --- Pages (teaching content) ---
export async function createPage(formData: FormData) {
  const { user, school } = await requireTeacher();
  const title = String(formData.get("title") || "").trim();
  if (!title) redirect("/pages?err=title");
  const courseId = String(formData.get("courseId") || "");
  const page = await prisma.page.create({
    data: {
      schoolId: school!.id,
      courseId: courseId || null,
      title,
      body: String(formData.get("body") || ""),
      format: "markdown",
      published: formData.get("published") === "on",
    },
  });
  await logAudit(user.id, "page_created", title);
  revalidatePath("/pages");
  redirect(`/pages/${page.id}`);
}

export async function updatePage(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const page = await prisma.page.findFirst({ where: { id, schoolId: school!.id } });
  if (!page) redirect("/pages");
  const courseId = String(formData.get("courseId") || "");
  await prisma.page.update({
    where: { id },
    data: {
      title: String(formData.get("title") || page.title),
      body: String(formData.get("body") || ""),
      courseId: courseId || null,
      published: formData.get("published") === "on",
    },
  });
  await logAudit(user.id, "page_updated", id);
  revalidatePath("/pages");
  revalidatePath(`/pages/${id}`);
  revalidatePath("/student/path");
  redirect(`/pages/${id}?saved=1`);
}

export async function deletePage(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const page = await prisma.page.findFirst({ where: { id, schoolId: school!.id } });
  if (page) {
    // Remove it from any module it was placed in, then delete it.
    await prisma.moduleItem.deleteMany({ where: { schoolId: school!.id, kind: "page", refId: id } });
    await prisma.page.delete({ where: { id } });
    await logAudit(user.id, "page_deleted", page.title);
  }
  revalidatePath("/pages");
  revalidatePath("/modules");
  redirect("/pages?deleted=1");
}

// --- Modules (sequenced curriculum) ---
export async function createModule(formData: FormData) {
  const { user, school } = await requireTeacher();
  const name = String(formData.get("name") || "").trim();
  if (!name) redirect("/modules?err=name");
  const courseId = String(formData.get("courseId") || "");
  const last = await prisma.module.findFirst({
    where: { schoolId: school!.id },
    orderBy: { position: "desc" },
  });
  const m = await prisma.module.create({
    data: {
      schoolId: school!.id,
      courseId: courseId || null,
      name,
      description: String(formData.get("description") || ""),
      position: (last?.position ?? 0) + 1,
    },
  });
  await logAudit(user.id, "module_created", name);
  revalidatePath("/modules");
  redirect(`/modules/${m.id}`);
}

export async function updateModule(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const m = await prisma.module.findFirst({ where: { id, schoolId: school!.id } });
  if (!m) redirect("/modules");
  const prereq = String(formData.get("prereqModuleId") || "");
  const courseId = String(formData.get("courseId") || "");
  await prisma.module.update({
    where: { id },
    data: {
      name: String(formData.get("name") || m.name),
      description: String(formData.get("description") || ""),
      courseId: courseId || null,
      unlockAt: String(formData.get("unlockAt") || ""),
      requireSequential: formData.get("requireSequential") === "on",
      published: formData.get("published") === "on",
      // A module can't be its own prerequisite.
      prereqModuleId: prereq && prereq !== id ? prereq : null,
    },
  });
  await logAudit(user.id, "module_updated", id);
  revalidatePath("/modules");
  revalidatePath(`/modules/${id}`);
  revalidatePath("/student/path");
  redirect(`/modules/${id}?saved=1`);
}

export async function deleteModule(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const m = await prisma.module.findFirst({ where: { id, schoolId: school!.id } });
  if (m) {
    const items = await prisma.moduleItem.findMany({ where: { moduleId: id } });
    await prisma.moduleProgress.deleteMany({
      where: { moduleItemId: { in: items.map((i) => i.id) } },
    });
    await prisma.moduleItem.deleteMany({ where: { moduleId: id } });
    // Anything that depended on this module is no longer gated by it.
    await prisma.module.updateMany({
      where: { schoolId: school!.id, prereqModuleId: id },
      data: { prereqModuleId: null },
    });
    await prisma.module.delete({ where: { id } });
    await logAudit(user.id, "module_deleted", m.name);
  }
  revalidatePath("/modules");
  redirect("/modules?deleted=1");
}

export async function moveModule(formData: FormData) {
  const { school } = await requireTeacher();
  const id = String(formData.get("id"));
  const dir = String(formData.get("dir")); // up | down
  const all = await prisma.module.findMany({
    where: { schoolId: school!.id },
    orderBy: { position: "asc" },
  });
  const idx = all.findIndex((m) => m.id === id);
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (idx >= 0 && swapWith >= 0 && swapWith < all.length) {
    await prisma.module.update({
      where: { id: all[idx].id },
      data: { position: all[swapWith].position },
    });
    await prisma.module.update({
      where: { id: all[swapWith].id },
      data: { position: all[idx].position },
    });
  }
  revalidatePath("/modules");
  redirect("/modules");
}

// --- Module items ---
export async function addModuleItem(formData: FormData) {
  const { user, school } = await requireTeacher();
  const moduleId = String(formData.get("moduleId"));
  const m = await prisma.module.findFirst({ where: { id: moduleId, schoolId: school!.id } });
  if (!m) redirect("/modules");

  const kind = String(formData.get("kind") || "page");
  const refId = String(formData.get("refId") || "");
  const title = String(formData.get("title") || "");
  if (kind !== "header" && !refId) redirect(`/modules/${moduleId}?err=ref`);

  const last = await prisma.moduleItem.findFirst({
    where: { moduleId },
    orderBy: { position: "desc" },
  });
  const minScoreRaw = String(formData.get("minScore") || "").trim();
  await prisma.moduleItem.create({
    data: {
      schoolId: school!.id,
      moduleId,
      kind,
      refId: kind === "header" ? "" : refId,
      title,
      position: (last?.position ?? 0) + 1,
      required: formData.get("required") !== "off",
      minScore: kind === "assignment" && minScoreRaw ? Number(minScoreRaw) : null,
    },
  });
  await logAudit(user.id, "module_item_added", `${m.name}: ${kind}`);
  revalidatePath(`/modules/${moduleId}`);
  revalidatePath("/student/path");
  redirect(`/modules/${moduleId}?added=1`);
}

export async function removeModuleItem(formData: FormData) {
  const { school } = await requireTeacher();
  const id = String(formData.get("id"));
  const it = await prisma.moduleItem.findFirst({ where: { id, schoolId: school!.id } });
  if (it) {
    await prisma.moduleProgress.deleteMany({ where: { moduleItemId: id } });
    await prisma.moduleItem.delete({ where: { id } });
    revalidatePath(`/modules/${it.moduleId}`);
    revalidatePath("/student/path");
    redirect(`/modules/${it.moduleId}`);
  }
  redirect("/modules");
}

export async function moveModuleItem(formData: FormData) {
  const { school } = await requireTeacher();
  const id = String(formData.get("id"));
  const dir = String(formData.get("dir"));
  const it = await prisma.moduleItem.findFirst({ where: { id, schoolId: school!.id } });
  if (!it) redirect("/modules");
  const all = await prisma.moduleItem.findMany({
    where: { moduleId: it.moduleId },
    orderBy: { position: "asc" },
  });
  const idx = all.findIndex((x) => x.id === id);
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (idx >= 0 && swapWith >= 0 && swapWith < all.length) {
    await prisma.moduleItem.update({
      where: { id: all[idx].id },
      data: { position: all[swapWith].position },
    });
    await prisma.moduleItem.update({
      where: { id: all[swapWith].id },
      data: { position: all[idx].position },
    });
  }
  revalidatePath(`/modules/${it.moduleId}`);
  revalidatePath("/student/path");
  redirect(`/modules/${it.moduleId}`);
}

// --- Progress reports ---
// AI drafts, a human approves, nothing reaches a family on its own. A report is
// invisible to parents until a teacher has read it and pressed approve.
export async function generateProgressReport(formData: FormData) {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;
  const studentId = String(formData.get("studentId"));
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) redirect("/students");

  const start = String(formData.get("start") || periodStart());
  const end = String(formData.get("end") || today());

  const [e, mastery] = await Promise.all([
    evidenceFor(studentId, start, end),
    masteryForStudent(studentId, schoolId, { start, end }),
  ]);

  const graded = e.submissions.filter((s) => s.status === "graded" && s.score != null);
  const earned = graded.reduce((n, s) => n + (s.score ?? 0), 0);
  const possible = graded.reduce((n, s) => n + s.points, 0);
  const td = today();
  const missingCount = e.submissions.filter(
    (s) => (s.status === "assigned" || s.status === "draft") && (s.dueDate ?? "") < td
  ).length;

  const nar = await progressNarrative({
    student,
    school: school!,
    period: { start, end },
    presentDays: e.presentDays,
    loggedDays: e.attendance.length,
    graded: graded.map((g) => ({
      assignmentTitle: g.assignmentTitle,
      courseName: g.courseName,
      score: g.score,
      points: g.points,
      feedback: g.feedback,
    })),
    missingCount,
    overallPct: possible > 0 ? earned / possible : null,
    standards: e.standards,
    observations: e.observations,
  });

  const report = await prisma.progressReport.create({
    data: {
      schoolId,
      studentId,
      periodStart: start,
      periodEnd: end,
      narrative: nar.text,
      source: nar.source,
      status: "draft",
      createdById: user.id,
      createdByName: user.name,
    },
  });
  await logAudit(user.id, "progress_report_drafted", `${student.name} (${start}..${end}) via ${nar.source}`);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/reports");
  redirect(`/reports/progress/${report.id}`);
}

export async function saveProgressReport(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const rep = await prisma.progressReport.findFirst({ where: { id, schoolId: school!.id } });
  if (!rep) redirect("/reports");

  await prisma.progressReport.update({
    where: { id },
    data: { narrative: String(formData.get("narrative") || "").slice(0, 8000), source: "edited" },
  });
  await logAudit(user.id, "progress_report_edited", id);
  revalidatePath(`/reports/progress/${id}`);
  redirect(`/reports/progress/${id}?saved=1`);
}

// The approval gate: only after this can a family see it.
export async function approveProgressReport(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const rep = await prisma.progressReport.findFirst({ where: { id, schoolId: school!.id } });
  if (!rep) redirect("/reports");
  if (!rep.narrative.trim()) redirect(`/reports/progress/${id}?err=empty`);

  await prisma.progressReport.update({
    where: { id },
    data: { status: "approved", approvedAt: new Date().toISOString(), approvedByName: user.name },
  });
  const rStudent = await prisma.student.findUnique({ where: { id: rep.studentId } });
  await notifyUsers(
    await parentUserIdsFor(rep.studentId, school!.id),
    {
      schoolId: school!.id,
      type: "report",
      title: `Progress report ready for ${rStudent?.name.split(" ")[0] ?? "your child"}`,
      body: `Covering ${rep.periodStart} to ${rep.periodEnd}.`,
      linkPath: "/parent/reports",
    },
    user.id
  );

  await logAudit(user.id, "progress_report_approved", id);
  revalidatePath(`/reports/progress/${id}`);
  revalidatePath("/reports");
  revalidatePath("/parent/reports");
  redirect(`/reports/progress/${id}?approved=1`);
}

// Pull a report back from the family view (e.g. an error was spotted).
export async function unapproveProgressReport(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const rep = await prisma.progressReport.findFirst({ where: { id, schoolId: school!.id } });
  if (!rep) redirect("/reports");
  await prisma.progressReport.update({
    where: { id },
    data: { status: "draft", approvedAt: null, approvedByName: null },
  });
  await logAudit(user.id, "progress_report_unapproved", id);
  revalidatePath(`/reports/progress/${id}`);
  revalidatePath("/parent/reports");
  redirect(`/reports/progress/${id}?pulled=1`);
}

export async function deleteProgressReport(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const rep = await prisma.progressReport.findFirst({ where: { id, schoolId: school!.id } });
  if (rep) {
    await prisma.progressReport.delete({ where: { id } });
    await logAudit(user.id, "progress_report_deleted", id);
  }
  revalidatePath("/reports");
  revalidatePath("/parent/reports");
  redirect("/reports?deleted=1");
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
    await runMasteryPaths({
      schoolId,
      studentId: sub.studentId,
      assignmentId: sub.assignmentId,
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
      instructionsFormat: ws.instructionsFormat,
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

// Record a human's decision on a proposed rule change.
//
// Deliberately does NOT edit src/lib/rules.ts. "Applied it" means the reviewer
// says they made the change (or merged the PR) — the app never writes its own
// rules file from a web page, however many humans nodded along the way. The
// record exists so a source that keeps producing rejected proposals can be
// spotted and re-pointed.
export async function decideProposal(formData: FormData) {
  const { user } = await requireTeacher();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  if (decision !== "accepted" && decision !== "rejected") redirect("/proposals");
  const note = String(formData.get("note") || "").trim().slice(0, 500);

  const p = await prisma.ruleProposal.findUnique({ where: { id } });
  if (!p) redirect("/proposals");

  await prisma.ruleProposal.update({
    where: { id },
    data: {
      status: decision,
      decidedBy: user.id,
      decidedAt: new Date().toISOString(),
      decisionNote: note,
    },
  });
  await logAudit(user.id, "rule_proposal_decided", `${id} → ${decision}${note ? `: ${note}` : ""}`);
  revalidatePath("/proposals");
  redirect("/proposals");
}

// --- School calendar ---
// Terms and closures set the instructional-day count that every ESA invoice
// claims, so these are billing edits, not scheduling ones. Audited accordingly.
const CAL_KINDS = new Set(["term", "closure", "event"]);

export async function addCalendarEvent(formData: FormData) {
  const { user, school } = await requireTeacher();
  const kind = String(formData.get("kind") || "event");
  const title = String(formData.get("title") || "").trim();
  const startDate = String(formData.get("startDate") || "").trim();
  // A single-day entry may leave the end blank; treat it as the same day rather
  // than as an open-ended range.
  const endRaw = String(formData.get("endDate") || "").trim();
  const endDate = endRaw || startDate;

  const valid = /^\d{4}-\d{2}-\d{2}$/;
  if (!CAL_KINDS.has(kind) || !title || !valid.test(startDate) || !valid.test(endDate)) {
    redirect("/calendar?error=invalid");
  }
  if (endDate < startDate) redirect("/calendar?error=backwards");

  await prisma.calendarEvent.create({
    data: {
      schoolId: school!.id,
      kind,
      title,
      startDate,
      endDate,
      note: String(formData.get("note") || "").trim(),
      staffOnly: formData.get("staffOnly") === "on",
    },
  });
  await logAudit(user.id, "calendar_event_added", `${kind}: ${title} ${startDate}–${endDate}`);
  revalidatePath("/calendar");
  redirect("/calendar?added=1");
}

export async function deleteCalendarEvent(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const e = await prisma.calendarEvent.findFirst({ where: { id, schoolId: school!.id } });
  if (!e) redirect("/calendar");
  await prisma.calendarEvent.delete({ where: { id } });
  await logAudit(user.id, "calendar_event_deleted", `${e.kind}: ${e.title} ${e.startDate}–${e.endDate}`);
  revalidatePath("/calendar");
  redirect("/calendar?deleted=1");
}

// Which weekdays this school teaches. Changing it moves the denominator on
// every invoice, which is exactly why it lives here and not in a hidden default.
export async function saveSchoolDays(formData: FormData) {
  const { user, school } = await requireTeacher();
  const picked = [1, 2, 3, 4, 5, 6, 7].filter((d) => formData.get(`d${d}`) === "on");
  if (picked.length === 0) redirect("/calendar?error=nodays");
  await prisma.school.update({
    where: { id: school!.id },
    data: { schoolDays: picked.join(",") },
  });
  await logAudit(user.id, "school_days_saved", picked.join(","));
  revalidatePath("/calendar");
  revalidatePath("/evidence");
  redirect("/calendar?saved=1");
}

// Rotate the secret in a user's iCal subscription URL. The old URL stops working
// immediately — this is the revoke button for a credential that lives in a URL.
export async function regenerateCalendarToken() {
  const { user } = await requireTeacher();
  await prisma.user.update({
    where: { id: user.id },
    data: { calendarToken: newTokenValue() },
  });
  await logAudit(user.id, "calendar_token_rotated", user.id);
  revalidatePath("/calendar");
  redirect("/calendar?rotated=1");
}

// --- Announcements ---
// A broadcast, not a conversation. Publishing is the moment notifications fire,
// and it happens exactly once: editing afterwards fixes the text without
// pinging forty phones again.
const AUDIENCE_VALUES = new Set(["all", "parents", "students"]);

export async function saveAnnouncement(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const audienceRaw = String(formData.get("audience") || "all");
  const audience = AUDIENCE_VALUES.has(audienceRaw) ? audienceRaw : "all";
  const pinned = formData.get("pinned") === "on";
  const requireAck = formData.get("requireAck") === "on";
  // The submit button carries the intent, so one form does draft and publish.
  const publishNow = String(formData.get("intent") || "") === "publish";

  if (!title) redirect("/announcements?error=title");

  if (id) {
    const existing = await prisma.announcement.findFirst({ where: { id, schoolId: school!.id } });
    if (!existing) redirect("/announcements");
    const nowPublishing = publishNow && !existing.publishedAt;
    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        title,
        body,
        audience,
        pinned,
        requireAck,
        // publishedAt is set once and never moved — it is the timestamp families
        // see, and rewriting it on every edit would reorder their list.
        ...(nowPublishing ? { publishedAt: new Date().toISOString() } : {}),
      },
    });
    if (nowPublishing) await announce(updated, school!.id, user.id);
    await logAudit(user.id, nowPublishing ? "announcement_published" : "announcement_updated", `${id}: ${title}`);
    revalidatePath("/announcements");
    redirect(`/announcements?${nowPublishing ? "published" : "saved"}=1`);
  }

  const created = await prisma.announcement.create({
    data: {
      schoolId: school!.id,
      authorId: user.id,
      authorName: user.name,
      title,
      body,
      bodyFormat: "markdown",
      audience,
      pinned,
      requireAck,
      publishedAt: publishNow ? new Date().toISOString() : null,
    },
  });
  if (publishNow) await announce(created, school!.id, user.id);
  await logAudit(user.id, publishNow ? "announcement_published" : "announcement_drafted", `${created.id}: ${title}`);
  revalidatePath("/announcements");
  redirect(`/announcements?${publishNow ? "published" : "saved"}=1`);
}

// Fan out notifications for a newly published announcement.
async function announce(
  a: { id: string; title: string; body: string; audience: string; requireAck: boolean },
  schoolId: string,
  actorId: string
) {
  const audience = (AUDIENCE_VALUES.has(a.audience) ? a.audience : "all") as
    | "all"
    | "parents"
    | "students";
  const userIds = await familyUserIdsByRole(schoolId, audience);
  // Parents land on the parent list, students on theirs; one link can't serve
  // both, so the notification is written per role.
  const parents = await prisma.user.findMany({
    where: { id: { in: userIds }, role: "parent" },
    select: { id: true },
  });
  const students = await prisma.user.findMany({
    where: { id: { in: userIds }, role: "student" },
    select: { id: true },
  });
  const base = {
    schoolId,
    type: "announcement" as const,
    title: a.requireAck ? `Please read: ${a.title}` : a.title,
    body: excerpt(a.body),
  };
  await notifyUsers(parents.map((p) => p.id), { ...base, linkPath: "/parent/announcements" }, actorId);
  await notifyUsers(students.map((s) => s.id), { ...base, linkPath: "/student/announcements" }, actorId);
}

export async function deleteAnnouncement(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const a = await prisma.announcement.findFirst({ where: { id, schoolId: school!.id } });
  if (!a) redirect("/announcements");
  await prisma.announcementAck.deleteMany({ where: { announcementId: id } });
  await prisma.announcement.delete({ where: { id } });
  await logAudit(user.id, "announcement_deleted", `${id}: ${a.title}`);
  revalidatePath("/announcements");
  redirect("/announcements?deleted=1");
}

export async function togglePinAnnouncement(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const a = await prisma.announcement.findFirst({ where: { id, schoolId: school!.id } });
  if (!a) redirect("/announcements");
  await prisma.announcement.update({ where: { id }, data: { pinned: !a.pinned } });
  await logAudit(user.id, "announcement_pin", `${id} → ${!a.pinned}`);
  revalidatePath("/announcements");
  redirect("/announcements");
}

// --- Inline annotation on uploaded work ---
// Pins live on the submission, not the file, so a resubmitted photo starts
// clean rather than inheriting marks about work the student has since redone.
export async function addAnnotation(formData: FormData) {
  const { user, school } = await requireTeacher();
  const submissionId = String(formData.get("submissionId"));
  const body = String(formData.get("body") || "").trim().slice(0, 600);
  const x = clamp01(Number(formData.get("x")));
  const y = clamp01(Number(formData.get("y")));

  const sub = await prisma.submission.findFirst({
    where: { id: submissionId, schoolId: school!.id },
  });
  if (!sub || !sub.fileId || !body) redirect("/grading");

  // Only pin on something we can actually place a pin on.
  const file = await prisma.fileRec.findUnique({ where: { id: sub.fileId } });
  if (!isAnnotatable(file)) redirect("/grading");

  await prisma.annotation.create({
    data: {
      schoolId: school!.id,
      submissionId,
      fileId: sub.fileId,
      x,
      y,
      body,
      authorId: user.id,
      authorName: user.name,
    },
  });
  await logAudit(user.id, "annotation_added", `${submissionId} @ ${x.toFixed(2)},${y.toFixed(2)}`);
  revalidatePath("/grading");
  redirect("/grading");
}

export async function deleteAnnotation(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const a = await prisma.annotation.findFirst({ where: { id, schoolId: school!.id } });
  if (!a) redirect("/grading");
  await prisma.annotation.delete({ where: { id } });
  await logAudit(user.id, "annotation_deleted", id);
  revalidatePath("/grading");
  redirect("/grading");
}

// Pin or unpin a nav item for the signed-in teacher.
//
// Not audited: rearranging your own shortcuts is not an event anyone needs a
// record of, and filling the audit log with it would bury the entries that
// matter.
export async function toggleNavPin(formData: FormData) {
  const { user } = await requireTeacher();
  const href = String(formData.get("href") || "");
  const next = togglePin(parsePins(user.pinnedNav), href);
  await prisma.user.update({
    where: { id: user.id },
    data: { pinnedNav: JSON.stringify(next) },
  });
  // Every page shows the sidebar, so the layout has to re-render everywhere.
  revalidatePath("/", "layout");
  redirect(String(formData.get("back") || "/dashboard"));
}

// --- Parent-teacher conferences ---
export async function publishConferenceSlots(formData: FormData) {
  const { user, school } = await requireTeacher();
  const date = String(formData.get("date") || "").trim();
  const start = parseTime(String(formData.get("start") || ""));
  const end = parseTime(String(formData.get("end") || ""));
  const durationMin = Number(formData.get("duration")) || 0;
  const gapMin = Number(formData.get("gap")) || 0;
  const location = String(formData.get("location") || "").trim().slice(0, 120);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || start === null || end === null) {
    redirect("/conferences?error=when");
  }

  const candidates = generateSlots({ startMin: start, endMin: end, durationMin, gapMin });
  if (candidates.length === 0) redirect("/conferences?error=none");

  // Skip anything colliding with slots already published for that day —
  // publishing the same afternoon twice is an easy mis-click, and the result
  // is two 3:20s that two different families each book.
  const existing = await prisma.conferenceSlot.findMany({
    where: { schoolId: school!.id, date },
    select: { startMin: true, endMin: true },
  });
  const fresh = withoutClashes(candidates, existing);
  if (fresh.length === 0) redirect("/conferences?error=clash");

  await prisma.conferenceSlot.createMany({
    data: fresh.map((s) => ({
      schoolId: school!.id,
      date,
      startMin: s.startMin,
      endMin: s.endMin,
      location,
    })),
  });
  await logAudit(user.id, "conference_slots_published", `${date}: ${fresh.length} slots`);
  revalidatePath("/conferences");
  redirect(`/conferences?added=${fresh.length}&skipped=${candidates.length - fresh.length}`);
}

export async function deleteConferenceSlot(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const slot = await prisma.conferenceSlot.findFirst({ where: { id, schoolId: school!.id } });
  if (!slot) redirect("/conferences");
  // Removing a slot a family has already claimed would cancel their
  // appointment silently. Make the teacher unbook it first, deliberately.
  if (slot.bookedByUserId) redirect("/conferences?error=booked");
  await prisma.conferenceSlot.delete({ where: { id } });
  await logAudit(user.id, "conference_slot_deleted", `${slot.date} ${slot.startMin}`);
  revalidatePath("/conferences");
  redirect("/conferences");
}

// The teacher's note after the conference happened. This is the bit that turns
// a calendar entry into evidence, so it shows on the student's printed record.
export async function saveConferenceNote(formData: FormData) {
  const { user, school } = await requireTeacher();
  const id = String(formData.get("id"));
  const slot = await prisma.conferenceSlot.findFirst({ where: { id, schoolId: school!.id } });
  if (!slot) redirect("/conferences");
  await prisma.conferenceSlot.update({
    where: { id },
    data: { note: String(formData.get("note") || "").trim().slice(0, 4000) },
  });
  await logAudit(user.id, "conference_note_saved", id);
  revalidatePath("/conferences");
  redirect("/conferences?saved=1");
}

// --- School branding (8.5) ---
//
// The packet a state reviewer reads should be the school's document. These
// three actions are what makes it one.

/** Logo formats a browser will render inline. PDF is absent (it isn't an
 *  image) and so is SVG — an SVG is a document that can carry script, and this
 *  file gets embedded into pages we generate. */
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function uploadLogo(formData: FormData) {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;
  const file = formData.get("file") as File | null;
  const back = "/settings";

  if (!file || file.size === 0) redirect(`${back}?logo=empty`);
  const ext = LOGO_TYPES[file.type];
  if (!ext) redirect(`${back}?logo=type`);
  // Smaller cap than a work sample: this is inlined as base64 into every packet
  // we generate, where a 5 MB logo becomes ~6.7 MB of markup on each document.
  if (file.size > 1024 * 1024) redirect(`${back}?logo=big`);

  const buf = Buffer.from(await file.arrayBuffer());
  const created = await prisma.fileRec.create({
    data: {
      schoolId,
      // Null: this is the school's own mark, not a record about a child. The
      // retention purge is scoped away from these deliberately.
      studentId: null,
      label: "School logo",
      ext,
      mime: file.type,
      bytes: buf.length,
      data: buf,
      capturedAt: new Date().toISOString(),
    },
  });

  const previous = school!.logoFileId;
  await prisma.school.update({ where: { id: schoolId }, data: { logoFileId: created.id } });
  // Swap first, then delete: if this ran the other way round and the update
  // failed, the school would be left pointing at a row that no longer exists.
  if (previous) await prisma.fileRec.deleteMany({ where: { id: previous, schoolId } });

  await logAudit(user.id, "school_logo_updated", `${buf.length} bytes`);
  revalidatePath("/settings");
  redirect(`${back}?logo=ok`);
}

export async function removeLogo() {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;
  const previous = school!.logoFileId;
  await prisma.school.update({ where: { id: schoolId }, data: { logoFileId: null } });
  if (previous) await prisma.fileRec.deleteMany({ where: { id: previous, schoolId } });
  await logAudit(user.id, "school_logo_removed", schoolId);
  revalidatePath("/settings");
  redirect("/settings?logo=removed");
}

export async function updateAccent(formData: FormData) {
  const { user, school } = await requireTeacher();
  const raw = String(formData.get("accentColor") || "");
  // Storing the PARSED value, not the raw one. Validating on the way out would
  // mean the database holds a string we have already decided is unsafe, and the
  // next reader of that column has to remember why.
  const parsed = parseAccent(raw);
  if (raw.trim() !== "" && !parsed) redirect("/settings?logo=colour");
  await prisma.school.update({
    where: { id: school!.id },
    data: { accentColor: parsed ?? "" },
  });
  await logAudit(user.id, "school_accent_updated", parsed ?? "(default)");
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
