// GET /reports/export/[kind]?start=&end= — records as CSV.
//
// kind: grades | attendance | mastery | roster
//
// These are the files a founder attaches to a state submission or hands to a
// family, so every download is written to the audit log.

import { NextResponse } from "next/server";
import { getSession, logAudit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { periodStart, today } from "@/lib/dates";
import { toCsv, csvResponse } from "@/lib/csv";
import { PROGRAMS } from "@/lib/rules";
import { buildRow, letterFor, type AssignmentInput, type CellInput } from "@/lib/gradebook";
import { rollup } from "@/lib/outcomes";

export const dynamic = "force-dynamic";

const KINDS = ["grades", "attendance", "mastery", "roster"] as const;
type Kind = (typeof KINDS)[number];

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const session = await getSession();
  if (!session || !["owner", "teacher"].includes(session.user.role)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const { user, school } = session;
  const schoolId = school!.id;
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) return new Response("Unknown export.", { status: 404 });

  const url = new URL(req.url);
  const start = url.searchParams.get("start") || periodStart();
  const end = url.searchParams.get("end") || today();
  const inRange = (d: string) => d >= start && d <= end;

  const students = await prisma.student.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? "—";
  const stamp = `${start}_to_${end}`;

  let csv = "";
  let filename = "";

  if (kind === "roster") {
    filename = `roster_${today()}.csv`;
    csv = toCsv(
      ["Student", "Grade", "Family", "Funding program", "ESA amount", "Annual tuition"],
      students.map((s) => [
        s.name,
        s.grade,
        s.familyName,
        s.esaProgram ? PROGRAMS[s.esaProgram]?.label ?? s.esaProgram : "Private pay",
        s.esaAmount,
        s.tuitionAnnual,
      ])
    );
  }

  if (kind === "attendance") {
    filename = `attendance_${stamp}.csv`;
    const rows = await prisma.attendance.findMany({
      where: { schoolId, date: { gte: start, lte: end } },
      orderBy: [{ date: "asc" }],
    });
    csv = toCsv(
      ["Date", "Student", "Status", "Note"],
      rows.map((a) => [a.date, nameOf(a.studentId), a.status, a.note])
    );
  }

  if (kind === "grades") {
    filename = `grades_${stamp}.csv`;
    const [assignmentsRaw, submissions, courses] = await Promise.all([
      prisma.assignment.findMany({ where: { schoolId }, orderBy: { dueDate: "asc" } }),
      prisma.submission.findMany({ where: { schoolId } }),
      prisma.course.findMany({ where: { schoolId } }),
    ]);
    const assignments = assignmentsRaw.filter((a) => inRange(a.dueDate));
    const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? "—";

    const gbAssignments: AssignmentInput[] = assignments.map((a) => ({
      id: a.id,
      title: a.title,
      points: a.points,
      dueDate: a.dueDate,
      courseId: a.courseId,
      type: a.type,
    }));
    const cells: CellInput[] = submissions.map((s) => ({
      submissionId: s.id,
      studentId: s.studentId,
      assignmentId: s.assignmentId,
      status: s.status,
      score: s.score,
      submittedAt: s.submittedAt,
    }));

    const rows: unknown[][] = [];
    for (const s of students) {
      const row = buildRow(s.id, gbAssignments, cells, today());
      for (const a of assignments) {
        const cell = row.cells.find((c) => c.assignmentId === a.id);
        if (!cell || !cell.submissionId) continue; // not assigned to this student
        rows.push([
          s.name,
          s.grade,
          courseName(a.courseId),
          a.title,
          a.type,
          a.dueDate,
          cell.status,
          cell.score ?? "",
          a.points,
          cell.pct != null ? Math.round(cell.pct * 100) : "",
          cell.late ? "late" : "",
        ]);
      }
      // Per-student summary line so the file is readable on its own.
      rows.push([
        s.name,
        s.grade,
        "— OVERALL —",
        `${row.gradedCount} graded, ${row.missingCount} missing`,
        "",
        "",
        "summary",
        row.earned,
        row.possible,
        row.pct != null ? Math.round(row.pct * 100) : "",
        letterFor(row.pct),
      ]);
    }
    csv = toCsv(
      [
        "Student",
        "Grade level",
        "Course",
        "Assignment",
        "Type",
        "Due",
        "Status",
        "Score",
        "Points",
        "Percent",
        "Flag",
      ],
      rows
    );
  }

  if (kind === "mastery") {
    filename = `standards_mastery_${stamp}.csv`;
    const [outcomes, results] = await Promise.all([
      prisma.outcome.findMany({ where: { schoolId }, orderBy: [{ subject: "asc" }, { code: "asc" }] }),
      prisma.outcomeResult.findMany({ where: { schoolId } }),
    ]);
    const threshold = school!.masteryThreshold ?? 0.8;
    const rows: unknown[][] = [];
    for (const s of students) {
      const mine = results
        .filter((r) => r.studentId === s.id && inRange((r.recordedAt || "").slice(0, 10)))
        .map((r) => ({
          outcomeId: r.outcomeId,
          score: r.score,
          possible: r.possible,
          recordedAt: r.recordedAt,
        }));
      for (const o of outcomes) {
        const u = rollup(o.id, mine, threshold);
        if (u.attempts === 0) continue; // only report what was actually assessed
        rows.push([
          s.name,
          s.grade,
          o.subject,
          o.code,
          o.title,
          u.attempts,
          u.pct != null ? Math.round(u.pct * 100) : "",
          u.mastered ? "mastered" : u.status,
          u.lastAt ? u.lastAt.slice(0, 10) : "",
        ]);
      }
    }
    csv = toCsv(
      [
        "Student",
        "Grade level",
        "Subject",
        "Standard",
        "Skill",
        "Attempts",
        "Level %",
        "Status",
        "Last assessed",
      ],
      rows
    );
  }

  await logAudit(user.id, "records_exported", `${kind} (${start}..${end})`);
  return csvResponse(filename, csv);
}
