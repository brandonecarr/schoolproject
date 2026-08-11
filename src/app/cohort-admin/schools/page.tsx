// /cohort-admin/schools — every school on the platform, one row each, with
// a right-hand detail panel instead of a separate page. The server gathers
// EVERYTHING each panel needs up front (aggregates, recent invoices, owner
// email) so opening a record is a client-side slide, not a round-trip; the
// URL still carries ?school=<id> so refresh lands on the open record.
//
// prismaSystem throughout: cross-school reads are this console's whole job.
// Aggregates and school-level rows only — no student names, no child work.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { SchoolsView, type SchoolRow } from "./SchoolsView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Schools — Cohort Admin" };

export default async function AdminSchools() {
  await requirePlatformAdmin();

  const [schools, students, users, parents, invoiceSums, invoices, owners] = await Promise.all([
    prismaSystem.school.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        state: true,
        createdAt: true,
        providerRail: true,
        contactPhone: true,
        studentEstimate: true,
        gradesServed: true,
        heardFrom: true,
        priorTooling: true,
        subscriptionStatus: true,
      },
    }),
    prismaSystem.student.groupBy({ by: ["schoolId"], _count: true }),
    prismaSystem.user.groupBy({ by: ["schoolId"], _count: true }),
    prismaSystem.user.groupBy({ by: ["schoolId"], where: { role: "parent" }, _count: true }),
    prismaSystem.invoice.groupBy({ by: ["schoolId", "status"], _sum: { amount: true } }),
    prismaSystem.invoice.findMany({
      orderBy: { periodStart: "desc" },
      select: { id: true, schoolId: true, periodStart: true, status: true, amount: true },
    }),
    prismaSystem.user.findMany({
      where: { role: "owner" },
      select: { schoolId: true, email: true, name: true },
    }),
  ]);

  const studentCount = new Map(students.map((s) => [s.schoolId, s._count]));
  const userCount = new Map(users.map((u) => [u.schoolId, u._count]));
  const parentCount = new Map(parents.map((p) => [p.schoolId, p._count]));
  const paidBySchool = new Map<string, number>();
  for (const i of invoiceSums) {
    if (i.status === "paid") {
      paidBySchool.set(i.schoolId, (paidBySchool.get(i.schoolId) ?? 0) + (i._sum.amount ?? 0));
    }
  }
  const ownerBySchool = new Map<string, { email: string; name: string }>();
  for (const o of owners) {
    if (o.schoolId && !ownerBySchool.has(o.schoolId)) {
      ownerBySchool.set(o.schoolId, { email: o.email, name: o.name });
    }
  }
  const invoicesBySchool = new Map<string, SchoolRow["invoices"]>();
  for (const inv of invoices) {
    const list = invoicesBySchool.get(inv.schoolId) ?? [];
    if (list.length < 6) {
      list.push({ id: inv.id, periodStart: inv.periodStart, status: inv.status, amount: inv.amount });
      invoicesBySchool.set(inv.schoolId, list);
    }
  }

  const rows: SchoolRow[] = schools.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    state: s.state,
    providerRail: s.providerRail,
    joinedIso: s.createdAt.toISOString(),
    students: studentCount.get(s.id) ?? 0,
    accounts: userCount.get(s.id) ?? 0,
    families: parentCount.get(s.id) ?? 0,
    paid: paidBySchool.get(s.id) ?? 0,
    ownerEmail: ownerBySchool.get(s.id)?.email ?? null,
    ownerName: ownerBySchool.get(s.id)?.name ?? null,
    contactPhone: s.contactPhone,
    studentEstimate: s.studentEstimate,
    gradesServed: s.gradesServed,
    heardFrom: s.heardFrom,
    priorTooling: s.priorTooling,
    subscriptionStatus: s.subscriptionStatus,
    invoices: invoicesBySchool.get(s.id) ?? [],
  }));

  return <SchoolsView schools={rows} />;
}
