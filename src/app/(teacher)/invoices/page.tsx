import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { Pill, Notice, VerifyFlag } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { reimbursementMetrics, formatPct } from "@/lib/metrics";
import { buildInvoices } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "ESA invoices — Cohort" };

const STATUS_TONE: Record<string, Tone | "mark"> = {
  paid: "good",
  approved: "mark",
  submitted: "info",
  rejected: "bad",
  draft: "warn",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ built?: string; skipped?: string }>;
}) {
  const { school, rail } = await requireTeacher();
  const schoolId = school!.id;
  const sp = await searchParams;

  const esaStudents = await prisma.student.count({ where: { schoolId, NOT: { esaProgram: null } } });
  const invoices = await prisma.invoice.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" } });
  const students = await prisma.student.findMany({ where: { schoolId } });
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name || "—";
  const m = reimbursementMetrics(invoices);
  const built = sp.built ? Number(sp.built) : null;
  const skipped = sp.skipped ? Number(sp.skipped) : 0;

  return (
    <>
      {built != null && (
        <Notice tone={built > 0 ? "good" : "info"}>
          {built > 0
            ? `Built ${built} draft invoice packet(s). Review each one before you submit — nothing has been sent anywhere.`
            : "No new packets to build for this period."}
          {skipped > 0
            ? ` ${skipped} student(s) already had a packet for this period and were skipped.`
            : ""}
        </Notice>
      )}
      <div className="topbar">
        <div>
          <div className="eyebrow">
            {rail ? rail.label : "No rail"} · {school!.state}
          </div>
          <h1>ESA invoices</h1>
        </div>
        <form action={buildInvoices}>
          <button className="btn mark">Build packets for {esaStudents} students</button>
        </form>
      </div>

      {rail && (
        <div className="notice info">
          <strong>{rail.label} requires:</strong> {rail.requires.map((r) => r.label).join(" · ")}
          {rail.verify && (
            <VerifyFlag>
              These requirements are unverified placeholders. Confirm each one against a real
              submission before a customer relies on it.
            </VerifyFlag>
          )}
        </div>
      )}

      <div className="grid g3" style={{ marginTop: 16 }}>
        <div className="stat">
          <div className="n">{formatPct(m.firstPassRate)}</div>
          <div className="l">First-pass approval</div>
          {m.decided > 0 && (
            <div className="small muted" style={{ marginTop: 4 }}>
              {m.firstPassPaid} of {m.decided} decided
            </div>
          )}
        </div>
        <div className="stat">
          <div className="n">
            {m.avgDaysToCash == null ? "—" : m.avgDaysToCash}
            {m.avgDaysToCash != null && (
              <span style={{ fontSize: 15, color: "var(--ink-soft)" }}> days</span>
            )}
          </div>
          <div className="l">Avg days to cash</div>
          {m.paidCount > 0 && (
            <div className="small muted" style={{ marginTop: 4 }}>
              over {m.paidCount} paid
            </div>
          )}
        </div>
        <div className="stat">
          <div className="n">${m.inFlight.toLocaleString()}</div>
          <div className="l">In flight</div>
          <div className="small muted" style={{ marginTop: 4 }}>
            ${m.paidTotal.toLocaleString()} paid · ${m.draftTotal.toLocaleString()} in draft
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "16px 10px", marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Period</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length ? (
              invoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{nameOf(i.studentId)}</strong>
                  </td>
                  <td className="small">
                    {fmt(i.periodStart)} – {fmt(i.periodEnd)}
                  </td>
                  <td className="mono">${Number(i.amount).toLocaleString()}</td>
                  <td>
                    <Pill tone={STATUS_TONE[i.status] ?? "warn"}>{i.status}</Pill>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link className="btn sec sm" href={`/invoices/${i.id}`}>
                      Open packet
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: "22px 10px" }}>
                  No packets yet. Build them from the button above — it uses the attendance,
                  coursework, and observations already in the system.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
