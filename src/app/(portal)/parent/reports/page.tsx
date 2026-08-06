import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progress reports — Cohort" };

// Families see APPROVED reports only.
//
// This page used to generate an AI summary live on every visit and show it to
// the parent unreviewed — while telling them it had been "reviewed by your
// teacher". It hadn't. Reports are now written, read, and approved by a real
// teacher before they appear here, and the attribution says exactly what
// happened.
export default async function ParentReportsPage() {
  const { user } = await requireRole("parent");
  const ids: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  const kids = (await prisma.student.findMany({ where: { id: { in: ids } } })).sort(
    (a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)
  );
  const reports = await prisma.progressReport.findMany({
    where: { studentId: { in: ids }, status: "approved" },
    orderBy: { periodEnd: "desc" },
  });
  const nameOf = (id: string) => kids.find((k) => k.id === id)?.name ?? "";

  return (
    <>
      <div className="eyebrow">From your teacher</div>
      <h1 style={{ margin: "2px 0 16px" }}>Progress reports</h1>

      {reports.length === 0 ? (
        <div className="card">
          <h3 style={{ margin: 0 }}>No reports yet</h3>
          <p className="muted" style={{ margin: "8px 0 0", maxWidth: "58ch" }}>
            When your teacher finishes a progress report for{" "}
            {kids.length === 1 ? kids[0]?.name.split(" ")[0] ?? "your child" : "your children"}, it
            will appear here. In the meantime, the{" "}
            <a href="/parent/feed">activity feed</a> shows day-to-day work as it happens.
          </p>
        </div>
      ) : (
        reports.map((r) => (
          <div key={r.id} className="card">
            <div className="spread" style={{ alignItems: "baseline" }}>
              <div>
                <div className="eyebrow">
                  {fmt(r.periodStart)} – {fmt(r.periodEnd)}
                </div>
                {kids.length > 1 && <h2 style={{ margin: "4px 0 0" }}>{nameOf(r.studentId)}</h2>}
              </div>
              <a
                className="btn ghost sm"
                href={`/records/${r.studentId}/print?start=${r.periodStart}&end=${r.periodEnd}`}
                target="_blank"
                rel="noreferrer"
              >
                Full record
              </a>
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 15.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {r.narrative}
            </p>
            <p className="small muted" style={{ margin: "16px 0 0" }}>
              Written by {r.createdByName}
              {r.approvedByName && r.approvedByName !== r.createdByName
                ? `, approved by ${r.approvedByName}`
                : ""}
              {r.approvedAt ? ` on ${fmt(r.approvedAt.slice(0, 10))}` : ""}
              {r.source === "ai" || r.source === "edited"
                ? " · first draft assembled by Cohort from the term's records, then reviewed and approved by your teacher"
                : ""}
              .
            </p>
          </div>
        ))
      )}
    </>
  );
}
