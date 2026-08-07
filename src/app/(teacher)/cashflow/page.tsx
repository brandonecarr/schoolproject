import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { forecast, tuitionSplit, addDays } from "@/lib/billing";
import { fmt } from "@/lib/dates";
import { Pill } from "@/components/ui";
import { VerificationNote } from "@/components/VerificationNote";
import { verificationCounts, railVerification } from "@/lib/observe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cash flow — Cohort" };

export default async function CashflowPage() {
  const { school, rail } = await requireTeacher();
  const vidx = await verificationCounts(school!.id);
  const schoolId = school!.id;

  const invoices = await prisma.invoice.findMany({ where: { schoolId } });
  const students = await prisma.student.findMany({ where: { schoolId } });
  const monthlyFamily = Math.round(
    students.reduce((a, s) => a + tuitionSplit(s).family, 0) / 10
  );
  const f = forecast(invoices, rail ? rail.id : null, monthlyFamily);
  // f.rail is a disbursement profile, not a Rail — verification keys off the
  // school's actual rail id.
  const railV = rail ? railVerification(vidx, rail.id) : null;
  const outstanding = invoices.filter((i) => i.status !== "paid");
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name || "—";
  // Bars scale to the largest bucket, not to a fixed dollar ceiling — a school
  // billing $9k a quarter and one billing $90k both get a readable chart. The
  // 1.15 is headroom: without it the tallest bar touches the top of the plot,
  // and when every bucket is equal (which is the common case for a school on
  // level monthly tuition) all three max out and the chart reads as broken
  // rather than as flat.
  const peak = Math.max(1, ...f.buckets.map((b) => b.esa + b.family)) * 1.15;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Next 90 days</div>
          <h1>Cash flow</h1>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -12, maxWidth: "64ch" }}>
        {f.rail.note} Money you earned this month lands in a later one — this is the gap that puts
        founders on credit cards.
      </p>

      {/* The handoff draws eight monthly columns. forecast() in lib/billing.ts
          produces three 90-day buckets, and reshaping it to months would be a
          domain change rather than a restyle — so the real buckets get the
          chart's treatment. Each bar is stacked: ESA money and family money
          arrive from different places and on different clocks, which is the
          distinction this page exists to make. */}
      <div className="card2" style={{ marginTop: 18 }}>
        <div className="eyebrow">Expected to land</div>
        <div className="chart" style={{ marginTop: 10 }}>
          {f.buckets.map((b) => {
            const total = b.esa + b.family;
            const h = (v: number) => Math.round((v / peak) * 150);
            return (
              <div key={b.key} className="col">
                <div className="val">{total > 0 ? `$${total.toLocaleString()}` : "—"}</div>
                <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div
                    className="barc"
                    style={{ height: h(b.family), background: "var(--good-f)", borderRadius: "8px 8px 0 0" }}
                    title={`Families $${b.family.toLocaleString()}`}
                  />
                  <div
                    className="barc"
                    style={{
                      height: h(b.esa),
                      background: "var(--accent)",
                      borderRadius: b.family > 0 ? "0 0 3px 3px" : "8px 8px 3px 3px",
                    }}
                    title={`ESA $${b.esa.toLocaleString()}`}
                  />
                </div>
                <div className="mon">{b.label}</div>
              </div>
            );
          })}
        </div>
        <div className="legend" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <span className="k">
            <i style={{ background: "var(--accent)" }} /> ESA reimbursement
          </span>
          <span className="k">
            <i style={{ background: "var(--good-f)" }} /> Family tuition
          </span>
        </div>
      </div>

      <div className="sep" />
      {f.unscheduled > 0 ? (
        <div className="notice warn">
          <strong>${f.unscheduled.toLocaleString()} isn&apos;t on the clock yet.</strong> That&apos;s
          sitting in draft invoice packets. The {f.rail.lagDays}-day wait doesn&apos;t start until you
          submit them — every day a packet sits in draft is a day added to how long you wait.{" "}
          <Link href="/invoices">Review and submit</Link>.
        </div>
      ) : (
        <div className="notice good">Every built packet has been submitted. Nothing is sitting still.</div>
      )}

      <div className="card">
        <div className="eyebrow">How this is calculated</div>
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          Submitted packets are expected {f.rail.lagDays} days after their submission date. Family
          payments are spread evenly across a 10-month year. Draft packets are excluded from the
          buckets on purpose — they have no submission date, so they have no arrival date.
        </p>
        {f.rail.verify && railV && (
          <VerificationNote v={railV} what={`${rail!.label}'s ${f.rail.lagDays}-day payment lag`} />
        )}
      </div>

      <div className="sep" />
      <div className="card2 nopad">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Period</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Expected</th>
            </tr>
          </thead>
          <tbody>
            {outstanding.length ? (
              outstanding.map((i) => {
                const land = i.submittedAt ? addDays(i.submittedAt.slice(0, 10), f.rail.lagDays) : null;
                return (
                  <tr key={i.id}>
                    <td>{nameOf(i.studentId)}</td>
                    <td className="small">
                      {fmt(i.periodStart)} – {fmt(i.periodEnd)}
                    </td>
                    <td className="mono">${Number(i.amount).toLocaleString()}</td>
                    <td>
                      <Pill tone={i.status === "submitted" ? "info" : "warn"}>{i.status}</Pill>
                    </td>
                    <td className="small">
                      {land ? fmt(land) : <span className="muted">not submitted</span>}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: "20px 10px" }}>
                  Nothing outstanding.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
