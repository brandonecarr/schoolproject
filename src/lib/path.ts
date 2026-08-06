// Server-side assembly of a student's course path: fetch the published
// curriculum, their work, and their page progress, then hand it all to the pure
// lock engine in lib/modules.ts.

import { prisma } from "@/lib/db";
import { today } from "@/lib/dates";
import { buildModuleStates, type ModuleState } from "@/lib/modules";

export type PathData = {
  states: ModuleState[];
  pageTitles: Map<string, string>;
  assignmentTitles: Map<string, string>;
  submissionByAssignment: Map<string, { id: string; status: string; score: number | null }>;
};

export async function pathForStudent(
  studentId: string,
  schoolId: string,
  { isTeacher = false }: { isTeacher?: boolean } = {}
): Promise<PathData> {
  const [modulesRaw, itemsRaw, submissions, progress] = await Promise.all([
    prisma.module.findMany({
      where: isTeacher ? { schoolId } : { schoolId, published: true },
      orderBy: { position: "asc" },
    }),
    prisma.moduleItem.findMany({ where: { schoolId }, orderBy: { position: "asc" } }),
    prisma.submission.findMany({ where: { studentId } }),
    prisma.moduleProgress.findMany({ where: { studentId } }),
  ]);

  const moduleIds = new Set(modulesRaw.map((m) => m.id));
  const items = itemsRaw.filter((i) => moduleIds.has(i.moduleId));

  // Titles for display, resolved in bulk.
  const pageIds = items.filter((i) => i.kind === "page").map((i) => i.refId);
  const asgIds = items.filter((i) => i.kind === "assignment").map((i) => i.refId);
  const [pages, assignments] = await Promise.all([
    pageIds.length ? prisma.page.findMany({ where: { id: { in: pageIds } } }) : [],
    asgIds.length ? prisma.assignment.findMany({ where: { id: { in: asgIds } } }) : [],
  ]);

  const states = buildModuleStates({
    modules: modulesRaw.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      position: m.position,
      published: m.published,
      unlockAt: m.unlockAt,
      requireSequential: m.requireSequential,
      prereqModuleId: m.prereqModuleId,
      courseId: m.courseId,
    })),
    items: items.map((i) => ({
      id: i.id,
      moduleId: i.moduleId,
      kind: i.kind,
      refId: i.refId,
      title: i.title,
      position: i.position,
      required: i.required,
      minScore: i.minScore,
    })),
    submissions: submissions.map((s) => ({
      assignmentId: s.assignmentId,
      status: s.status,
      score: s.score,
    })),
    pageDoneIds: new Set(progress.map((p) => p.moduleItemId)),
    today: today(),
    isTeacher,
  });

  return {
    states,
    pageTitles: new Map(pages.map((p) => [p.id, p.title])),
    assignmentTitles: new Map(assignments.map((a) => [a.id, a.title])),
    submissionByAssignment: new Map(
      submissions.map((s) => [s.assignmentId, { id: s.id, status: s.status, score: s.score }])
    ),
  };
}
