// The teacher reading a student's portfolio. Read-only here too — a teacher can
// suggest a piece belongs in it, but the arrangement and the reflections are
// the student's.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PortfolioPieces } from "@/components/PortfolioPieces";
import { portfolioFor } from "@/lib/portfolio-read";
import { reflectionGap } from "@/lib/portfolio";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portfolio — Cohort" };

export default async function TeacherPortfolioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { school } = await requireTeacher();
  const { id } = await params;
  const student = await prisma.student.findFirst({ where: { id, schoolId: school!.id } });
  if (!student) notFound();

  const pieces = await portfolioFor(id);
  const gap = reflectionGap(pieces);

  return (
    <>
      <div className="eyebrow">Portfolio</div>
      <h1>{student.name}</h1>
      <p className="small muted" style={{ maxWidth: "70ch" }}>
        Work {student.name.split(" ")[0]} chose, with their own reflections. A student explaining
        what they learned is some of the strongest evidence of instruction there is — reviewers read
        it differently from a list of scores.
      </p>
      {pieces.length > 0 && gap > 0 && (
        <Notice tone="info">
          {gap} of {pieces.length} {gap === 1 ? "piece has" : "pieces have"} no reflection yet. Worth
          a nudge — the writing is what makes this worth including in a packet.
        </Notice>
      )}
      <PortfolioPieces
        pieces={pieces}
        studentName={student.name}
        emptyNote="Nothing chosen yet."
      />
      <p className="small muted" style={{ marginTop: 18 }}>
        <Link href={`/students/${id}`}>← Back to {student.name}</Link>
      </p>
    </>
  );
}
