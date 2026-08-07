// A parent reading their child's portfolio. Read-only: it is the child's
// collection and the child's words, and a parent editing it would quietly turn
// it into the parent's.

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PortfolioPieces } from "@/components/PortfolioPieces";
import { portfolioFor } from "@/lib/portfolio-read";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portfolio — Cohort" };

export default async function ParentPortfolioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireRole("parent");
  const { id } = await params;

  const own: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  if (!own.includes(id)) redirect("/parent/children");

  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) redirect("/parent/children");
  const pieces = await portfolioFor(id);

  return (
    <>
      <div className="eyebrow">Chosen by {student.name.split(" ")[0]}</div>
      <h1>{student.name}&apos;s portfolio</h1>
      <p className="small muted" style={{ maxWidth: "64ch" }}>
        The work {student.name.split(" ")[0]} picked out, in their own order, with their own words
        about each piece.
      </p>
      <PortfolioPieces
        pieces={pieces}
        studentName={student.name}
        emptyNote={`${student.name.split(" ")[0]} hasn't chosen anything for their portfolio yet.`}
      />
      <p className="small muted" style={{ marginTop: 18 }}>
        <Link href="/parent/children">← Back to my children</Link>
      </p>
    </>
  );
}
