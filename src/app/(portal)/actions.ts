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
import { requireRole, requireUser, logAudit } from "@/lib/auth";
import { canSee } from "@/lib/announcements";
import { move, nextPosition } from "@/lib/portfolio";
import { hashPassword } from "@/lib/password";
import { deleteStudentData } from "@/lib/retention";
import { autoScoreQuiz, parseItems, parseQuizAnswers } from "@/lib/lms";
import { recordOutcomesForSubmission } from "@/lib/mastery";
import { notifyUsers, staffUserIdsFor } from "@/lib/notify";
import { runMasteryPaths } from "@/lib/paths-run";

// Image/PDF types a student may turn in (bytes stored in the DB, like samples).
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

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
  revalidatePath("/parent/children");
  redirect("/parent/children?created=1");
}

// Type-aware turn-in. Each assignment type has its own completion path:
//   quiz     → auto-score the self-gradable items; graded outright if nothing
//              needs a human, else waits in the grading queue with autoScore kept
//   checkoff → auto-credit full points on completion (+ optional reflection)
//   upload   → store the photo/PDF as a work sample and link it (feeds evidence)
//   written  → typed response (rubric also accepts an optional file)
// Resubmission is allowed from assigned/draft/returned; from graded only when
// the teacher enabled it.
export async function submitWork(formData: FormData) {
  const { user } = await requireRole("student");
  const id = String(formData.get("id"));

  const sub = await prisma.submission.findUnique({ where: { id } });
  if (!sub || sub.studentId !== user.studentId) redirect("/student"); // not your assignment
  const asg = await prisma.assignment.findUnique({ where: { id: sub.assignmentId } });
  if (!asg) redirect("/student");

  // Lock after submission. A student may only write while the work is open to
  // them: not yet turned in (assigned/draft), or explicitly reopened by the
  // teacher (returned). Once submitted or graded it is locked — the ONLY way
  // back in is the teacher's return-for-revision. This is enforced here, not
  // just in the UI, because server actions are directly POST-reachable.
  if (!["assigned", "draft", "returned"].includes(sub.status)) redirect("/student/work?locked=1");

  const now = new Date().toISOString();
  const cleared = { returnedAt: null, revisionNote: "" }; // a fresh turn-in clears any return

  const saveFile = async (label: string): Promise<string | null> => {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return null;
    const ext = ALLOWED[file.type];
    if (!ext || file.size > 8 * 1024 * 1024) return null;
    const buf = Buffer.from(await file.arrayBuffer());
    const rec = await prisma.fileRec.create({
      data: {
        schoolId: user.schoolId,
        studentId: user.studentId!,
        label,
        ext,
        mime: file.type,
        bytes: buf.length,
        data: buf,
        capturedAt: now,
      },
    });
    return rec.id;
  };

  if (asg.type === "quiz") {
    const items = parseItems(asg.configJson);
    const answers = parseQuizAnswers(String(formData.get("answers") || "[]"));
    const { auto, needsManual } = autoScoreQuiz(items, answers);
    await prisma.submission.update({
      where: { id },
      data: {
        status: needsManual ? "submitted" : "graded",
        submittedAt: now,
        answersJson: JSON.stringify(answers),
        autoScore: auto,
        score: needsManual ? null : auto,
        gradedAt: needsManual ? null : now,
        feedback: needsManual ? "" : "Auto-graded.",
        ...cleared,
      },
    });
    // Fully auto-graded quizzes are final, so they count toward mastery now.
    if (!needsManual) {
      await recordOutcomesForSubmission({
        schoolId: user.schoolId,
        studentId: user.studentId!,
        assignmentId: asg.id,
        submissionId: id,
        score: auto,
        possible: asg.points,
      });
      await runMasteryPaths({
        schoolId: user.schoolId,
        studentId: user.studentId!,
        assignmentId: asg.id,
        score: auto,
        possible: asg.points,
      });
    }
  } else if (asg.type === "checkoff") {
    const reflection = String(formData.get("reflection") || "").trim().slice(0, 500);
    await prisma.submission.update({
      where: { id },
      data: {
        status: "graded",
        submittedAt: now,
        gradedAt: now,
        answersJson: JSON.stringify({ done: true, reflection }),
        score: asg.points,
        autoScore: asg.points,
        feedback: "Completed.",
        ...cleared,
      },
    });
    await recordOutcomesForSubmission({
      schoolId: user.schoolId,
      studentId: user.studentId!,
      assignmentId: asg.id,
      submissionId: id,
      score: asg.points,
      possible: asg.points,
    });
    await runMasteryPaths({
      schoolId: user.schoolId,
      studentId: user.studentId!,
      assignmentId: asg.id,
      score: asg.points,
      possible: asg.points,
    });
  } else if (asg.type === "upload") {
    const fileId = await saveFile(`${asg.title} — turned in`);
    if (!fileId) redirect("/student/work?err=file");
    await prisma.submission.update({
      where: { id },
      data: {
        status: "submitted",
        submittedAt: now,
        fileId,
        responseText: String(formData.get("responseText") || "").slice(0, 2000),
        ...cleared,
      },
    });
  } else {
    // written or rubric — typed response, rubric may also attach a file
    const fileId = (await saveFile(`${asg.title} — turned in`)) ?? sub.fileId;
    await prisma.submission.update({
      where: { id },
      data: {
        status: "submitted",
        submittedAt: now,
        responseText: String(formData.get("responseText") || "").slice(0, 5000),
        fileId,
        ...cleared,
      },
    });
  }

  // Only tell the teacher when there's actually something to mark — a quiz that
  // auto-graded itself doesn't need to land in anyone's queue.
  const stillNeedsGrading = (await prisma.submission.findUnique({ where: { id } }))?.status === "submitted";
  if (stillNeedsGrading) {
    const student = await prisma.student.findUnique({ where: { id: user.studentId! } });
    await notifyUsers(await staffUserIdsFor(user.schoolId), {
      schoolId: user.schoolId,
      type: "submitted",
      title: `${student?.name ?? "A student"} turned in ${asg.title}`,
      body: "Waiting in the grading queue.",
      linkPath: "/grading",
    });
  }

  await logAudit(user.id, "submitted_work", id);
  revalidatePath("/student");
  revalidatePath("/student/work");
  revalidatePath("/dashboard");
  revalidatePath("/grading");
  redirect("/student/work?sent=1");
}

// Mark a module page as read. Pages are the only item kind with no other record
// of being done — assignment completion is derived from the submission itself.
export async function markPageRead(formData: FormData) {
  const { user } = await requireRole("student");
  const moduleItemId = String(formData.get("moduleItemId"));

  const item = await prisma.moduleItem.findFirst({
    where: { id: moduleItemId, schoolId: user.schoolId, kind: "page" },
  });
  if (!item) redirect("/student/path");

  await prisma.moduleProgress.upsert({
    where: { studentId_moduleItemId: { studentId: user.studentId!, moduleItemId } },
    create: {
      schoolId: user.schoolId,
      studentId: user.studentId!,
      moduleItemId,
      completedAt: new Date().toISOString(),
    },
    update: {},
  });
  await logAudit(user.id, "page_read", moduleItemId);
  revalidatePath("/student/path");
  redirect("/student/path?done=1");
}

// Save progress without turning in. Keeps the work in a "draft" state the
// student can return to. Not available once graded.
export async function saveDraft(formData: FormData) {
  const { user } = await requireRole("student");
  const id = String(formData.get("id"));
  const sub = await prisma.submission.findUnique({ where: { id } });
  if (!sub || sub.studentId !== user.studentId) redirect("/student/work");
  // Same lock as submit: no saving over work that's already turned in or graded.
  if (!["assigned", "draft", "returned"].includes(sub.status)) redirect("/student/work?locked=1");

  await prisma.submission.update({
    where: { id },
    data: {
      status: "draft",
      responseText: String(formData.get("responseText") || "").slice(0, 5000),
      answersJson: String(formData.get("answers") || sub.answersJson),
      draftSavedAt: new Date().toISOString(),
    },
  });
  await logAudit(user.id, "saved_draft", id);
  revalidatePath("/student");
  revalidatePath("/student/work");
  redirect("/student/work?draft=1");
}

// Parent reports an upcoming/known absence — posts an excused attendance record
// with a note the teacher sees (and which feeds the evidence they rely on).
export async function reportAbsence(formData: FormData) {
  const { user } = await requireRole("parent");
  const studentId = String(formData.get("studentId"));
  const date = String(formData.get("date") || "");
  const note = String(formData.get("note") || "").trim().slice(0, 300);

  const ownStudentIds: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  if (!ownStudentIds.includes(studentId) || !date) redirect("/parent/feed");

  const existing = await prisma.attendance.findFirst({ where: { studentId, date } });
  if (existing) {
    await prisma.attendance.update({
      where: { id: existing.id },
      data: { status: "excused", note: note || "Reported by parent" },
    });
  } else {
    await prisma.attendance.create({
      data: {
        schoolId: user.schoolId,
        studentId,
        date,
        status: "excused",
        note: note || "Reported by parent",
      },
    });
  }
  const absStudent = await prisma.student.findUnique({ where: { id: studentId } });
  await notifyUsers(await staffUserIdsFor(user.schoolId), {
    schoolId: user.schoolId,
    type: "absence",
    title: `${absStudent?.name ?? "A student"} reported absent on ${date}`,
    body: note || "Reported by parent.",
    linkPath: `/attendance?date=${date}`,
  });

  await logAudit(user.id, "absence_reported", `${studentId} ${date}`);
  revalidatePath("/parent/feed");
  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  redirect("/parent/feed?absence=1");
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
  revalidatePath("/parent/children");
  redirect("/parent/children?deleted=1");
}

// Confirm you've read an announcement.
//
// Re-checks visibility rather than trusting the id in the form: a posted id is
// user input, and acknowledging a draft or another audience's notice would both
// create a false record and reveal that it exists.
export async function acknowledgeAnnouncement(formData: FormData) {
  const { user } = await requireUser();
  const id = String(formData.get("id"));
  const back = user.role === "student" ? "/student/announcements" : "/parent/announcements";

  const a = await prisma.announcement.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!a || !canSee(a, user.role)) redirect(back);

  // Idempotent: a double-click is one reader, enforced by the unique index too.
  const existing = await prisma.announcementAck.findFirst({
    where: { announcementId: id, userId: user.id },
  });
  if (!existing) {
    await prisma.announcementAck.create({
      data: { announcementId: id, userId: user.id, at: new Date().toISOString() },
    });
    await logAudit(user.id, "announcement_acknowledged", `${id}: ${a.title}`);
  }
  revalidatePath(back);
  redirect(back);
}

// --- Portfolio curation ---
// The student chooses what represents them and says why. Every action here
// re-derives the student id from the SESSION, never from the form: a posted
// studentId would let one child write into another's portfolio.

async function ownPortfolio(): Promise<{ userId: string; studentId: string; schoolId: string; name: string }> {
  const { user } = await requireRole("student");
  if (!user.studentId) redirect("/student");
  return { userId: user.id, studentId: user.studentId, schoolId: user.schoolId, name: user.name };
}

export async function addPortfolioEntry(formData: FormData) {
  const me = await ownPortfolio();
  const submissionId = String(formData.get("submissionId") || "") || null;
  const fileId = String(formData.get("fileId") || "") || null;
  if (!submissionId && !fileId) redirect("/student/portfolio");

  // Verify the piece is actually theirs before it can be referenced.
  if (submissionId) {
    const sub = await prisma.submission.findUnique({ where: { id: submissionId } });
    if (!sub || sub.studentId !== me.studentId) redirect("/student/portfolio");
  }
  if (fileId) {
    const f = await prisma.fileRec.findUnique({ where: { id: fileId } });
    if (!f || f.studentId !== me.studentId) redirect("/student/portfolio");
  }

  const existing = await prisma.portfolioEntry.findMany({ where: { studentId: me.studentId } });
  // Adding the same piece twice is always a mis-click, never an intention.
  if (existing.some((e) => (submissionId && e.submissionId === submissionId) || (fileId && e.fileId === fileId))) {
    redirect("/student/portfolio?already=1");
  }

  await prisma.portfolioEntry.create({
    data: {
      schoolId: me.schoolId,
      studentId: me.studentId,
      submissionId,
      fileId,
      title: String(formData.get("title") || "Untitled piece").trim().slice(0, 160),
      position: nextPosition(existing),
      addedByRole: "student",
      addedByName: me.name,
    },
  });
  await logAudit(me.userId, "portfolio_entry_added", submissionId ?? fileId ?? "");
  revalidatePath("/student/portfolio");
  redirect("/student/portfolio?added=1");
}

export async function savePortfolioEntry(formData: FormData) {
  const me = await ownPortfolio();
  const id = String(formData.get("id"));
  const entry = await prisma.portfolioEntry.findFirst({ where: { id, studentId: me.studentId } });
  if (!entry) redirect("/student/portfolio");

  await prisma.portfolioEntry.update({
    where: { id },
    data: {
      title: String(formData.get("title") || entry.title).trim().slice(0, 160) || entry.title,
      reflection: String(formData.get("reflection") || "").trim().slice(0, 4000),
    },
  });
  revalidatePath("/student/portfolio");
  redirect("/student/portfolio?saved=1");
}

export async function movePortfolioEntry(formData: FormData) {
  const me = await ownPortfolio();
  const id = String(formData.get("id"));
  const dir = String(formData.get("dir")) === "up" ? "up" : "down";

  const entries = await prisma.portfolioEntry.findMany({ where: { studentId: me.studentId } });
  // move() renumbers the whole sequence, so a list that drifted after deletes
  // gets repaired here rather than degrading further.
  const next = move(entries, id, dir);
  await Promise.all(
    next.map((e) => prisma.portfolioEntry.update({ where: { id: e.id }, data: { position: e.position } }))
  );
  revalidatePath("/student/portfolio");
  redirect("/student/portfolio");
}

export async function removePortfolioEntry(formData: FormData) {
  const me = await ownPortfolio();
  const id = String(formData.get("id"));
  const entry = await prisma.portfolioEntry.findFirst({ where: { id, studentId: me.studentId } });
  if (!entry) redirect("/student/portfolio");
  // Removing from the portfolio never deletes the work itself — the submission
  // and the file are the school's record and stay exactly where they were.
  await prisma.portfolioEntry.delete({ where: { id } });
  await logAudit(me.userId, "portfolio_entry_removed", id);
  revalidatePath("/student/portfolio");
  redirect("/student/portfolio?removed=1");
}
