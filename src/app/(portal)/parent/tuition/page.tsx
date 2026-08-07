import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ledgerFor } from "@/lib/billing";
import { PROGRAMS } from "@/lib/rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tuition — Cohort" };

export default async function ParentTuitionPage() {
  const { user } = await requireRole("parent");
  const ids: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  const kids = (await prisma.student.findMany({ where: { id: { in: ids } } })).sort(
    (a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)
  );

  const rows = await Promise.all(
    kids.map(async (k) => {
      const [payments, invoices] = await Promise.all([
        prisma.payment.findMany({ where: { studentId: k.id } }),
        prisma.invoice.findMany({ where: { studentId: k.id } }),
      ]);
      return { k, l: ledgerFor(k, payments, invoices) };
    })
  );

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">What&apos;s covered, what&apos;s owed</div>
          <h1>Tuition</h1>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -12, maxWidth: "60ch" }}>
        Your child&apos;s scholarship (ESA) covers part of tuition; you cover the rest. Here&apos;s where
        things stand. Online payment is coming soon — for now, arrange payment with the school
        directly.
      </p>

      {rows.map(({ k, l }) => (
        <div key={k.id} className="card2" style={{ marginTop: 16, maxWidth: 840 }}>
          <div className="spread">
            <h2>{k.name}</h2>
            <span className="small muted">
              {k.esaProgram ? PROGRAMS[k.esaProgram]?.label ?? k.esaProgram : "Private pay"} · ${l.annual.toLocaleString()}/yr
            </span>
          </div>

          <div className="insetstats">
            <div className="insetstat muted">
              <div className="n">${l.esa.toLocaleString()}</div>
              <div className="l">ESA covers</div>
            </div>
            <div className="insetstat">
              <div className="n">${l.family.toLocaleString()}</div>
              <div className="l">Your portion</div>
            </div>
            <div className={`insetstat ${l.familyBalance > 0 ? "warn" : "good"}`}>
              <div className="n">${l.familyBalance.toLocaleString()}</div>
              <div className="l">{l.familyBalance > 0 ? "You still owe" : "Paid in full"}</div>
            </div>
          </div>

          <div className="ledgerlist">
            <div className="ledgerline">
              <span style={{ flex: 1 }}>You&apos;ve paid</span>
              <span className="v">
                ${l.familyPaid.toLocaleString()} of ${l.family.toLocaleString()}
              </span>
            </div>
            <div className="ledgerline">
              <span style={{ flex: 1 }}>ESA reimbursed to the school</span>
              <span className="v">
                ${l.esaPaid.toLocaleString()} of ${l.esa.toLocaleString()}
              </span>
            </div>
            {l.esaPending > 0 && (
              <div className="ledgerline">
                <span style={{ flex: 1 }}>ESA in progress</span>
                <span className="v">${l.esaPending.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
