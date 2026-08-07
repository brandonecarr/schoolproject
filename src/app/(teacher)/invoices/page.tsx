import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { Pill, Notice, StatCard } from "@/components/ui";
import { VerificationNote } from "@/components/VerificationNote";
import { verificationCounts, railVerification } from "@/lib/observe";
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
  // Evidence behind the rail's rules — one grouped query, not one per invoice.
  const vidx = await verificationCounts(school!.id);
  const railV = rail ? railVerification(vidx, rail.id) : null;
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
          {rail.verify && <VerificationNote v={railV!} what={`${rail.label}'s requirements`} />}
        </div>
      )}

      {/* The handoff groups these rows into quarterly packets. Our invoices are
          per student per period — that is the data model, and reshaping it to
          match a mockup would be a functional change, not a restyle. The stat
          row above maps cleanly either way. */}
      <div className="statrow" style={{ marginTop: 16 }}>
        <StatCard
          label="Reimbursed this year"
          value={`$${m.paidTotal.toLocaleString()}`}
          delta={m.paidCount > 0 ? `${m.paidCount} packet${m.paidCount === 1 ? "" : "s"} paid` : "Nothing paid yet"}
          tone="good"
        />
        <StatCard
          label="In flight"
          value={`$${m.inFlight.toLocaleString()}`}
          delta={m.counts.submitted ? `${m.counts.submitted} submitted` : "Nothing submitted"}
          tone="info"
        />
        <StatCard
          label="Not yet built"
          value={`$${m.draftTotal.toLocaleString()}`}
          delta={m.counts.draft ? `${m.counts.draft} in draft` : "No drafts"}
          tone="info"
        />
        <StatCard
          label="Avg days to cash"
          value={m.avgDaysToCash == null ? "—" : m.avgDaysToCash}
          delta={m.paidCount > 0 ? `Across ${m.paidCount} paid` : "No paid packets yet"}
          tone="info"
        />
      </div>

      <div className="card2 nopad" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Period</th>
              <th>Amount</th>
              <th>Status</th>
              <th><span className="sr-only">Actions</span></th>
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
