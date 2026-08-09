// /cohort-admin/leads — the pipeline. The server loads every lead (plus its
// booking, if one exists) and hands the lot to the client view, so filter
// chips and the detail/create panels respond instantly with no round-trip.
// Panel and filter state ride the URL (?status=, ?lead=, ?new=lead) so
// refresh and server-action redirects land where you were.
//
// prismaSystem: leads are a platform table — there is no tenant to scope to.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { LeadsView, type LeadRow } from "./LeadsView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leads — Cohort Admin" };

export default async function AdminLeads() {
  await requirePlatformAdmin();

  const [leads, bookings] = await Promise.all([
    prismaSystem.lead.findMany({ orderBy: { createdAt: "desc" } }),
    prismaSystem.walkthroughSlot.findMany({
      where: { leadId: { not: null } },
      select: { leadId: true, startsAt: true },
    }),
  ]);
  const bookingByLead = new Map(bookings.map((b) => [b.leadId, b.startsAt]));

  const rows: LeadRow[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email,
    note: l.note,
    source: l.source,
    state: l.state,
    ref: l.ref,
    status: l.status,
    createdIso: l.createdAt.toISOString(),
    bookingIso: bookingByLead.get(l.id)?.toISOString() ?? null,
  }));

  return <LeadsView leads={rows} />;
}
