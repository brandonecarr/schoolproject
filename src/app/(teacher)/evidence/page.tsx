import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { readiness, PROGRAMS } from "@/lib/rules";
import { periodStart, today, fmt } from "@/lib/dates";
import { EvidenceBar } from "@/components/EvidenceBar";
import { Pill } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Evidence board — Cohort" };

export default async function EvidenceBoardPage() {
  const { school } = await requireTeacher();
  const students = await prisma.student.findMany({
    where: { schoolId: school!.id },
    orderBy: { createdAt: "asc" },
  });
  const rows = await Promise.all(students.map(async (s) => ({ s, e: await evidenceFor(s.id) })));

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">
            {fmt(periodStart())} – {fmt(today())}
          </div>
          <h1>Evidence board</h1>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -12, maxWidth: "64ch" }}>
        Every state wants proof that real instruction happened. This is that proof, assembled from the
        teaching you already did. Fill the gaps before you invoice, not after you&apos;re rejected.
      </p>
      <div className="sep" />
      {rows.map(({ s, e }) => {
        const r = readiness(e.score);
        return (
          <div key={s.id} className="card">
            <div className="spread">
              <div>
                <h2>{s.name}</h2>
                <div className="small muted">
                  {s.esaProgram ? PROGRAMS[s.esaProgram]?.label ?? s.esaProgram : "Private pay — no invoice needed"}
                </div>
              </div>
              <div className="row">
                <Pill tone={r.tone}>{r.label}</Pill>
                <span className="mono">{e.score}/100</span>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <EvidenceBar parts={e.parts} />
            </div>
          </div>
        );
      })}
    </>
  );
}
