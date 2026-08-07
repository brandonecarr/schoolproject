import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ledgerFor } from "@/lib/billing";
import { Notice } from "@/components/ui";
import { recordPayment } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tuition — Cohort" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const { school } = await requireTeacher();
  const schoolId = school!.id;
  const sp = await searchParams;

  const students = await prisma.student.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  const rows = await Promise.all(
    students.map(async (s) => {
      const [payments, invoices] = await Promise.all([
        prisma.payment.findMany({ where: { studentId: s.id } }),
        prisma.invoice.findMany({ where: { studentId: s.id } }),
      ]);
      return { s, l: ledgerFor(s, payments, invoices) };
    })
  );

  const tot = rows.reduce(
    (a, r) => ({
      annual: a.annual + r.l.annual,
      collected: a.collected + r.l.collected,
      familyBalance: a.familyBalance + r.l.familyBalance,
    }),
    { annual: 0, collected: 0, familyBalance: 0 }
  );

  return (
    <>
      {sp.paid && <Notice tone="good">Payment recorded.</Notice>}
      <div className="topbar">
        <div>
          <div className="eyebrow">Who owes what</div>
          <h1>Tuition</h1>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -12, maxWidth: "64ch" }}>
        Families on a split arrangement pay part themselves and cover the rest with their ESA. Those
        two streams arrive on different clocks — the family pays this month, the state pays for the
        month you already taught.
      </p>

      <div className="grid g3" style={{ marginTop: 18 }}>
        <div className="stat">
          <div className="n">${tot.annual.toLocaleString()}</div>
          <div className="l">Billed this year</div>
        </div>
        <div className="stat">
          <div className="n">${tot.collected.toLocaleString()}</div>
          <div className="l">Collected</div>
        </div>
        <div className="stat">
          <div className="n">${tot.familyBalance.toLocaleString()}</div>
          <div className="l">Owed by families</div>
        </div>
      </div>

      <div className="sep" />
      <div className="card" style={{ padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Family portion</th>
              <th>ESA portion</th>
              <th>Outstanding</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, l }) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/students/${s.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                    {s.name}
                  </Link>
                  <div className="small muted">
                    {l.esa ? "Split payer" : "Private pay"} · ${l.annual.toLocaleString()}/yr
                  </div>
                </td>
                <td>
                  <span className="mono">${l.familyPaid.toLocaleString()}</span>{" "}
                  <span className="small muted">of ${l.family.toLocaleString()}</span>
                </td>
                <td>
                  <span className="mono">${l.esaPaid.toLocaleString()}</span>{" "}
                  <span className="small muted">of ${l.esa.toLocaleString()}</span>
                  {l.esaPending ? (
                    <div className="small" style={{ color: "var(--warn)" }}>
                      ${l.esaPending.toLocaleString()} in flight
                    </div>
                  ) : null}
                </td>
                <td className="mono">${l.outstanding.toLocaleString()}</td>
                <td style={{ textAlign: "right" }}>
                  <form
                    action={recordPayment}
                    className="row"
                    style={{ justifyContent: "flex-end", gap: 6 }}
                  >
                    <input type="hidden" name="studentId" value={s.id} />
                    <input
                      name="amount"
                      type="number"
                      min={1}
                      placeholder="0"
                      style={{ width: 92 }}
                      required
                      aria-label={`Payment amount for ${s.name}`}
                    />
                    <button className="btn sm">Record</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
