import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { weeklyReport } from "@/lib/ai";
import { fmt, today, daysAgo } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly reports — Cohort" };

export default async function ReportsPage() {
  const { user } = await requireRole("parent");
  const ids: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  const kids = await prisma.student.findMany({ where: { id: { in: ids } } });

  const blocks = await Promise.all(
    kids.map(async (k) => {
      const e = await evidenceFor(k.id, daysAgo(7), today());
      const rep = await weeklyReport({
        student: k,
        attendance: e.attendance,
        submissions: e.submissions,
        observations: e.observations,
      });
      return { k, rep };
    })
  );

  return (
    <>
      <h1 style={{ marginBottom: 16 }}>Weekly reports</h1>
      {blocks.map(({ k, rep }) => (
        <div key={k.id} className="card">
          <div className="eyebrow">Week ending {fmt(today())}</div>
          <h2 style={{ margin: "4px 0 12px" }}>{k.name}</h2>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65 }}>{rep.text}</p>
          <p className="small muted" style={{ margin: "14px 0 0" }}>
            Written by{" "}
            {rep.source === "ai"
              ? "Cohort from this week's records, reviewed by your teacher"
              : "Cohort from this week's records"}
            .
          </p>
        </div>
      ))}
    </>
  );
}
