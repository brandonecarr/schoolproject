// evidenceFor() — the single most-used query in the app. Ported from server.js.
//
// Assembles one student's proof over a billing window: attendance, submissions
// (joined to their assignment + course), observations, the assignments actually
// delivered to them, and work-sample files — then scores it. This is what the
// Evidence Board, student page, invoice packet, and parent reports all read.

import { cache } from "react";
import { prisma } from "@/lib/db";
import { scoreEvidence, type ScoredEvidence } from "@/lib/rules";
import { rollup } from "@/lib/outcomes";
import { periodStart, today } from "@/lib/dates";
import { instructionalDays, parseSchoolDays, hasCalendar } from "@/lib/calendar";
import { engagementSignal, type ActivityEvent, type EngagementSignal } from "@/lib/engagement";

export type EvidenceSubmission = {
  id: string;
  assignmentId: string;
  studentId: string;
  status: string;
  submittedAt: string | null;
  responseText: string;
  score: number | null;
  feedback: string;
  gradedAt: string | null;
  assignmentTitle: string;
  points: number;
  dueDate: string | null;
  courseName: string;
};

export type EvidenceAssignment = {
  id: string;
  title: string;
  dueDate: string;
  points: number;
  courseName: string;
};

export type EvidenceSample = {
  id: string;
  label: string;
  ext: string;
  mime: string;
};

export type EvidenceStandard = {
  code: string;
  title: string;
  pct: number;
  mastered: boolean;
};

export type Evidence = ScoredEvidence & {
  attendance: { id: string; date: string; status: string }[];
  submissions: EvidenceSubmission[];
  observations: { id: string; date: string; text: string; author: string }[];
  assignments: EvidenceAssignment[];
  samples: EvidenceSample[];
  // Standards demonstrated in this window (empty when the school tracks none).
  standards: EvidenceStandard[];
  standardsMastered: number;
  // Instructional days the school's published calendar puts in this window, or
  // null when no calendar is published. Null and 0 mean very different things:
  // null is "we can't say", 0 is "the calendar says none".
  instructionalDays: number | null;
  // Whether this child is producing work on the days we expected them to.
  // Null without a published calendar, since there is no denominator then.
  //
  // The `state` on this is TEACHER-ONLY — see the header of lib/engagement.ts.
  // `factualSummary()` is the part safe for a family or a reviewer to read.
  engagement: EngagementSignal | null;
};

// The school row and its calendar are the SAME for every student on a page
// that scores the whole roster (dashboard, evidence board, /students).
// cache() memoises the pair for the life of one request, so a six-student
// roster costs one fetch instead of twelve. Outside a request (scripts,
// tests) cache() is a no-op passthrough.
const schoolWithCalendar = cache(async (schoolId: string) =>
  Promise.all([
    prisma.school.findUnique({ where: { id: schoolId } }),
    prisma.calendarEvent.findMany({ where: { schoolId } }),
  ])
);

export async function evidenceFor(
  studentId: string,
  start: string = periodStart(),
  end: string = today()
): Promise<Evidence> {
  const map = await evidenceForStudents([studentId], start, end);
  // The batch always yields an entry per requested id — a student with no
  // rows anywhere scores zero, it doesn't vanish.
  return map.get(studentId)!;
}

/**
 * Score a whole roster in ONE round of queries.
 *
 * The dashboard, evidence board and family pages all score every student at
 * once, and the per-student version cost each of them ~10 queries — with
 * row-level security wrapping every query in its own transaction, a
 * six-student roster paid for sixty round-trips. This fetches each table
 * once with `studentId IN (...)` and runs the identical in-memory assembly
 * per student, so the query count no longer grows with the roster.
 */
export async function evidenceForStudents(
  studentIds: string[],
  start: string = periodStart(),
  end: string = today()
): Promise<Map<string, Evidence>> {
  if (studentIds.length === 0) return new Map();
  const inRange = (d: string) => d >= start && d <= end;
  const idSet = { in: studentIds };

  // Pull everything for these students, then join in memory (small sets —
  // the same shape as the MVP's JSON store did it). fileRec deliberately
  // selects METADATA only: listing work samples must not haul every file's
  // bytes out of the database.
  const [attendanceEvery, subsEvery, observationsEvery, filesEvery, outcomeResultsEvery] =
    await Promise.all([
      prisma.attendance.findMany({ where: { studentId: idSet } }),
      prisma.submission.findMany({ where: { studentId: idSet } }),
      prisma.observation.findMany({ where: { studentId: idSet } }),
      prisma.fileRec.findMany({
        where: { studentId: idSet },
        select: {
          id: true,
          studentId: true,
          schoolId: true,
          label: true,
          ext: true,
          mime: true,
          capturedAt: true,
        },
      }),
      prisma.outcomeResult.findMany({ where: { studentId: idSet } }),
    ]);

  // Join submissions to assignment + course, across the union.
  const assignmentIdsAll = [...new Set(subsEvery.map((s) => s.assignmentId))];
  const assignmentRowsAll = assignmentIdsAll.length
    ? await prisma.assignment.findMany({ where: { id: { in: assignmentIdsAll } } })
    : [];
  const courseIds = [...new Set(assignmentRowsAll.map((a) => a.courseId))];
  const courseRows = courseIds.length
    ? await prisma.course.findMany({ where: { id: { in: courseIds } } })
    : [];
  const courseName = (courseId: string) => courseRows.find((c) => c.id === courseId)?.name || "—";

  // Outcome definitions for every in-range result, fetched once.
  const resultsInRangeAll = outcomeResultsEvery.filter((r) =>
    inRange((r.recordedAt || "").slice(0, 10))
  );
  const outcomeIdsAll = [...new Set(resultsInRangeAll.map((r) => r.outcomeId))];
  const outcomeRowsAll = outcomeIdsAll.length
    ? await prisma.outcome.findMany({ where: { id: { in: outcomeIdsAll } } })
    : [];

  // Engagement sources, batched with the same filters the per-student
  // version used (see engagementFor for why the role filters matter).
  const [progressEvery, portfolioEvery, messagesEvery] = await Promise.all([
    prisma.moduleProgress.findMany({
      where: { studentId: idSet },
      select: { studentId: true, completedAt: true },
    }),
    prisma.portfolioEntry.findMany({
      where: { studentId: idSet, addedByRole: "student" },
      select: { studentId: true, createdAt: true },
    }),
    prisma.message.findMany({
      where: { studentId: idSet, senderRole: "student" },
      select: { studentId: true, createdAt: true },
    }),
  ]);

  const out = new Map<string, Evidence>();
  for (const studentId of studentIds) {
    out.set(
      studentId,
      await assembleOne({
        studentId,
        start,
        end,
        attendanceAll: attendanceEvery.filter((r) => r.studentId === studentId),
        subsRaw: subsEvery.filter((r) => r.studentId === studentId),
        observationsAll: observationsEvery.filter((r) => r.studentId === studentId),
        filesAll: filesEvery.filter((r) => r.studentId === studentId),
        outcomeResultsAll: outcomeResultsEvery.filter((r) => r.studentId === studentId),
        assignmentRowsAll,
        courseName,
        outcomeRowsAll,
        progress: progressEvery.filter((r) => r.studentId === studentId),
        portfolio: portfolioEvery.filter((r) => r.studentId === studentId),
        messages: messagesEvery.filter((r) => r.studentId === studentId),
      })
    );
  }
  return out;
}

type AssembleInput = {
  studentId: string;
  start: string;
  end: string;
  attendanceAll: Awaited<ReturnType<typeof prisma.attendance.findMany>>;
  subsRaw: Awaited<ReturnType<typeof prisma.submission.findMany>>;
  observationsAll: { id: string; date: string; text: string; author: string }[];
  filesAll: {
    id: string;
    schoolId: string;
    label: string;
    ext: string;
    mime: string;
    capturedAt: string;
  }[];
  outcomeResultsAll: Awaited<ReturnType<typeof prisma.outcomeResult.findMany>>;
  assignmentRowsAll: Awaited<ReturnType<typeof prisma.assignment.findMany>>;
  courseName: (courseId: string) => string;
  outcomeRowsAll: Awaited<ReturnType<typeof prisma.outcome.findMany>>;
  progress: { completedAt: string | null }[];
  portfolio: { createdAt: Date }[];
  messages: { createdAt: Date }[];
};

// The per-student assembly — identical math to the original evidenceFor,
// operating on prefetched rows.
async function assembleOne(input: AssembleInput): Promise<Evidence> {
  const { studentId, start, end, attendanceAll, subsRaw, observationsAll, filesAll } = input;
  const inRange = (d: string) => d >= start && d <= end;

  // Pass attendance rows through unmapped, exactly as the per-student
  // version did — the print route serializes whatever is here.
  const attendance = attendanceAll.filter((a) => inRange(a.date));
  const observations = observationsAll
    .filter((o) => inRange(o.date))
    .map((o) => ({ id: o.id, date: o.date, text: o.text, author: o.author }));

  // This student's slice of the shared assignment join.
  const assignmentIds = new Set(subsRaw.map((s) => s.assignmentId));
  const assignmentRows = input.assignmentRowsAll.filter((a) => assignmentIds.has(a.id));
  const courseName = input.courseName;

  const submissions: EvidenceSubmission[] = subsRaw.map((s) => {
    const a = assignmentRows.find((x) => x.id === s.assignmentId);
    return {
      id: s.id,
      assignmentId: s.assignmentId,
      studentId: s.studentId,
      status: s.status,
      submittedAt: s.submittedAt,
      responseText: s.responseText,
      score: s.score,
      feedback: s.feedback,
      gradedAt: s.gradedAt,
      assignmentTitle: a ? a.title : "—",
      points: a ? a.points : 0,
      dueDate: a ? a.dueDate : null,
      courseName: a ? courseName(a.courseId) : "—",
    };
  });

  const assignments: EvidenceAssignment[] = assignmentRows.map((a) => ({
    id: a.id,
    title: a.title,
    dueDate: a.dueDate,
    points: a.points,
    courseName: courseName(a.courseId),
  }));

  const samples: EvidenceSample[] = filesAll
    .filter((f) => inRange((f.capturedAt || "").slice(0, 10)))
    .map((f) => ({ id: f.id, label: f.label, ext: f.ext, mime: f.mime }));

  // Standards demonstrated in this window. Rolled up per outcome (highest
  // attempt wins), so re-attempts read as growth rather than extra rows.
  const resultsInRange = input.outcomeResultsAll.filter((r) =>
    inRange((r.recordedAt || "").slice(0, 10))
  );
  let standards: EvidenceStandard[] = [];
  if (resultsInRange.length > 0) {
    const outcomeIds = [...new Set(resultsInRange.map((r) => r.outcomeId))];
    const outcomeRows = input.outcomeRowsAll.filter((o) => outcomeIds.includes(o.id));
    const outcomeSchoolId = outcomeRows[0]?.schoolId;
    const school = outcomeSchoolId ? (await schoolWithCalendar(outcomeSchoolId))[0] : null;
    const threshold = school?.masteryThreshold ?? 0.8;

    standards = outcomeIds
      .map((id) => {
        const o = outcomeRows.find((x) => x.id === id);
        const r = rollup(
          id,
          resultsInRange.map((x) => ({
            outcomeId: x.outcomeId,
            score: x.score,
            possible: x.possible,
            recordedAt: x.recordedAt,
          })),
          threshold
        );
        return {
          code: o?.code ?? "—",
          title: o?.title ?? "—",
          pct: r.pct ?? 0,
          mastered: r.mastered,
        };
      })
      .sort((a, b) => (a.code < b.code ? -1 : 1));
  }
  const standardsMastered = standards.filter((s) => s.mastered).length;

  // Instructional days from the school's published calendar. A student row
  // doesn't carry its school, so reach it through the attendance/assignment
  // rows we already have; when neither exists there is nothing to bill anyway.
  const schoolId =
    attendanceAll[0]?.schoolId ?? assignmentRows[0]?.schoolId ?? filesAll[0]?.schoolId ?? null;
  let instrDayList: string[] | null = null;
  if (schoolId) {
    const [school, calEvents] = await schoolWithCalendar(schoolId);
    if (school && hasCalendar(calEvents)) {
      instrDayList = instructionalDays(start, end, calEvents, parseSchoolDays(school.schoolDays));
    }
  }
  const instrDays = instrDayList === null ? null : instrDayList.length;

  // Engagement — derived entirely from rows this child's own actions already
  // created. Nothing here is new tracking, and logins are deliberately not a
  // source: a session row is presence at a screen rather than learning, and it
  // is the most surveillance-shaped thing we hold about a child.
  const engagement =
    instrDayList === null
      ? null
      : engagementFrom(instrDayList, attendance, subsRaw, input.progress, input.portfolio, input.messages);

  const scored = scoreEvidence({
    attendance,
    submissions,
    observations,
    assignments,
    samples,
    standards: standards.length > 0 ? { assessed: standards.length, mastered: standardsMastered } : null,
    instructionalDays: instrDays,
  });

  return {
    attendance,
    submissions,
    observations,
    assignments,
    samples,
    standards,
    standardsMastered,
    instructionalDays: instrDays,
    engagement,
    ...scored,
  };
}

/**
 * Gather the days on which this child did something, and score the result.
 *
 * The four sources are the four ways a child leaves a mark in this system by
 * their own action. A day counts once however much happened on it — a child who
 * submits six things on Tuesday worked on Tuesday, not six times.
 *
 * Note the filters on the last two: a portfolio piece the TEACHER added is the
 * teacher's action, and a message from a parent is the parent's. Counting
 * either as the child's engagement would let an attentive adult paper over a
 * child who has gone quiet, which is precisely the case this must not miss.
 */
function engagementFrom(
  instructional: string[],
  attendance: { date: string; status: string }[],
  // Everything arrives prefetched: the batch loader queried each source once
  // for the whole roster, so nothing here touches the database.
  subs: { submittedAt: string | null; draftSavedAt: string | null }[],
  progress: { completedAt: string | null }[],
  portfolio: { createdAt: Date }[],
  messages: { createdAt: Date }[]
): EngagementSignal {
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
  const events: ActivityEvent[] = [];
  const push = (date: string | null, kind: ActivityEvent["kind"]) => {
    if (date) events.push({ date, kind });
  };

  for (const s of subs) {
    // A saved draft is a child working, even though nothing was turned in.
    // Ignoring it would read a week of effort on a long piece as silence.
    push(day(s.submittedAt), "work");
    push(day(s.draftSavedAt), "work");
  }
  for (const p of progress) push(day(p.completedAt), "coursework");
  for (const p of portfolio) push(p.createdAt.toISOString().slice(0, 10), "portfolio");
  for (const m of messages) push(m.createdAt.toISOString().slice(0, 10), "message");

  return engagementSignal({ instructional, attendance, events });
}
