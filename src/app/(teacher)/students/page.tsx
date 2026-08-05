import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { readiness, PROGRAMS } from "@/lib/rules";
import { Pill, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Students — Cohort" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; skipped?: string; deleted?: string }>;
}) {
  const { school } = await requireTeacher();
  const sp = await searchParams;
  const students = await prisma.student.findMany({
    where: { schoolId: school!.id },
    orderBy: { createdAt: "asc" },
  });
  const rows = await Promise.all(students.map(async (s) => ({ s, e: await evidenceFor(s.id) })));

  return (
    <>
      {sp.imported && (
        <Notice tone="good">
          Imported {sp.imported} student(s)
          {sp.skipped && Number(sp.skipped) > 0 ? `, skipped ${sp.skipped} blank row(s)` : ""}.
        </Notice>
      )}
      {sp.deleted && <Notice tone="good">Student and all associated data permanently deleted.</Notice>}
      <div className="topbar">
        <div>
          <div className="eyebrow">Roster</div>
          <h1>Students</h1>
        </div>
        <Link className="btn sec" href="/students/import">
          Import roster (CSV)
        </Link>
      </div>
      <div className="card" style={{ padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Grade</th>
              <th>Funding</th>
              <th>Evidence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, e }) => {
              const r = readiness(e.score);
              return (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="small muted">{s.familyName} family</div>
                  </td>
                  <td>{s.grade}</td>
                  <td className="small">{s.esaProgram ? PROGRAMS[s.esaProgram].label : "Private pay"}</td>
                  <td>
                    <Pill tone={r.tone}>{e.score}</Pill>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link className="btn sec sm" href={`/students/${s.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
