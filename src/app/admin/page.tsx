// /admin — the platform operator's console. Overview: every school on the
// platform, with the numbers that say whether the business is working.
//
// EVERY query on this surface runs on prismaSystem, and the justification is
// the surface itself: this console exists to see across schools, it is behind
// requirePlatformAdmin (a flag no UI can set), and nothing here ever renders
// to anyone but the operator. Child data stays out of it — schools, counts
// and invoice totals, never student names or work.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { Pill } from "@/components/ui";
import { AdminNav } from "./nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Cohort" };

export default async function AdminOverview() {
  await requirePlatformAdmin();

  const schools = await prismaSystem.school.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, slug: true, state: true, createdAt: true, providerRail: true },
  });
  const [students, users, invoices, leads] = await Promise.all([
    prismaSystem.student.groupBy({ by: ["schoolId"], _count: true }),
    prismaSystem.user.groupBy({ by: ["schoolId"], _count: true }),
    prismaSystem.invoice.groupBy({ by: ["schoolId", "status"], _count: true, _sum: { amount: true } }),
    prismaSystem.lead.groupBy({ by: ["status"], _count: true }),
  ]);
  const studentCount = new Map(students.map((s) => [s.schoolId, s._count]));
  const userCount = new Map(users.map((u) => [u.schoolId, u._count]));
  const paidBySchool = new Map<string, number>();
  for (const i of invoices) {
    if (i.status === "paid") paidBySchool.set(i.schoolId, (paidBySchool.get(i.schoolId) ?? 0) + (i._sum.amount ?? 0));
  }
  const openLeads = leads.filter((l) => l.status === "new" || l.status === "contacted" || l.status === "scheduled")
    .reduce((a, l) => a + l._count, 0);

  return (
    <>
      <AdminNav active="overview" />
      <div className="eyebrow">Platform</div>
      <h1>Every school, one table</h1>

      <div className="cmd-metrics" style={{ marginTop: 14 }}>
        <div className="cmd-metric">
          <div className="n">{schools.length}</div>
          <div className="l">Schools</div>
        </div>
        <div className="cmd-metric">
          <div className="n">{[...studentCount.values()].reduce((a, b) => a + b, 0)}</div>
          <div className="l">Students</div>
        </div>
        <div className="cmd-metric">
          <div className="n">
            ${[...paidBySchool.values()].reduce((a, b) => a + b, 0).toLocaleString()}
          </div>
          <div className="l">Reimbursed, all time</div>
        </div>
        <div className={`cmd-metric ${openLeads > 0 ? "accent" : ""}`}>
          <div className="n">{openLeads}</div>
          <div className="l">Open leads</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14, padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>School</th>
              <th>Address</th>
              <th>State</th>
              <th>Students</th>
              <th>Accounts</th>
              <th>Paid</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {schools.length === 0 ? (
              <tr>
                <td colSpan={7} className="small muted">
                  No schools yet.
                </td>
              </tr>
            ) : (
              schools.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="small mono">{s.slug}</td>
                  <td>
                    <Pill tone="info">{s.state}</Pill>
                  </td>
                  <td className="num">{studentCount.get(s.id) ?? 0}</td>
                  <td className="num">{userCount.get(s.id) ?? 0}</td>
                  <td className="num">${(paidBySchool.get(s.id) ?? 0).toLocaleString()}</td>
                  <td className="small muted">{s.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
