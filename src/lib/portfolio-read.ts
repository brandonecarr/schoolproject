// Server-side assembly of a student's curated portfolio. Shared by the student,
// parent, teacher and print views so all four show the same thing.

import { prisma } from "@/lib/db";
import { ordered } from "@/lib/portfolio";

export type PortfolioPiece = {
  id: string;
  title: string;
  reflection: string;
  reflectionFormat: string;
  position: number;
  addedByRole: string;
  addedByName: string;
  /** Resolved from whichever source the entry points at. */
  fileId: string | null;
  isImage: boolean;
  sourceLabel: string;
  score: string | null;
  when: string | null;
};

export async function portfolioFor(studentId: string): Promise<PortfolioPiece[]> {
  const entries = ordered(await prisma.portfolioEntry.findMany({ where: { studentId } }));
  if (entries.length === 0) return [];

  const subIds = entries.map((e) => e.submissionId).filter((x): x is string => Boolean(x));
  const directFileIds = entries.map((e) => e.fileId).filter((x): x is string => Boolean(x));

  const subs = subIds.length
    ? await prisma.submission.findMany({ where: { id: { in: subIds } } })
    : [];
  const asgIds = [...new Set(subs.map((s) => s.assignmentId))];
  const asgs = asgIds.length
    ? await prisma.assignment.findMany({ where: { id: { in: asgIds } } })
    : [];

  // A submission may itself carry an uploaded file — that's the picture worth
  // showing, so resolve through to it.
  const subFileIds = subs.map((s) => s.fileId).filter((x): x is string => Boolean(x));
  const allFileIds = [...new Set([...directFileIds, ...subFileIds])];
  const files = allFileIds.length
    ? await prisma.fileRec.findMany({
        where: { id: { in: allFileIds } },
        select: { id: true, label: true, mime: true, ext: true },
      })
    : [];

  const isImg = (id: string | null) => {
    const f = files.find((x) => x.id === id);
    return Boolean(f && f.mime.startsWith("image/"));
  };

  return entries.map((e) => {
    const sub = e.submissionId ? subs.find((s) => s.id === e.submissionId) : null;
    const asg = sub ? asgs.find((a) => a.id === sub.assignmentId) : null;
    const file = files.find((f) => f.id === (sub?.fileId ?? e.fileId));
    return {
      id: e.id,
      title: e.title,
      reflection: e.reflection,
      reflectionFormat: e.reflectionFormat,
      position: e.position,
      addedByRole: e.addedByRole,
      addedByName: e.addedByName,
      fileId: file?.id ?? null,
      isImage: isImg(file?.id ?? null),
      sourceLabel: asg?.title ?? file?.label ?? "Work sample",
      score: sub && sub.score != null && asg ? `${sub.score}/${asg.points}` : null,
      when: sub?.gradedAt ?? sub?.submittedAt ?? null,
    };
  });
}

/** Pieces the student could still add: graded work and work samples not already in. */
export async function portfolioCandidates(studentId: string) {
  const [entries, subs, files] = await Promise.all([
    prisma.portfolioEntry.findMany({ where: { studentId } }),
    prisma.submission.findMany({ where: { studentId, status: "graded" }, orderBy: { gradedAt: "desc" } }),
    prisma.fileRec.findMany({ where: { studentId }, orderBy: { capturedAt: "desc" } }),
  ]);
  const usedSubs = new Set(entries.map((e) => e.submissionId).filter(Boolean));
  const usedFiles = new Set(entries.map((e) => e.fileId).filter(Boolean));

  const freeSubs = subs.filter((s) => !usedSubs.has(s.id));
  const asgIds = [...new Set(freeSubs.map((s) => s.assignmentId))];
  const asgs = asgIds.length ? await prisma.assignment.findMany({ where: { id: { in: asgIds } } }) : [];

  return {
    submissions: freeSubs.map((s) => ({
      id: s.id,
      title: asgs.find((a) => a.id === s.assignmentId)?.title ?? "Assignment",
      score: s.score,
      points: asgs.find((a) => a.id === s.assignmentId)?.points ?? 0,
    })),
    // A file that was turned in with a submission is already offered above, so
    // only stand-alone samples appear here.
    files: files
      .filter((f) => !usedFiles.has(f.id) && !subs.some((s) => s.fileId === f.id))
      .map((f) => ({ id: f.id, label: f.label, mime: f.mime })),
  };
}
