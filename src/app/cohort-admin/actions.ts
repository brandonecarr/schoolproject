"use server";

// Admin console actions. Every one starts with requirePlatformAdmin — the
// same rule as the pages, held by tests/admin.test.ts.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { looksLikeEmail, sendEmail } from "@/lib/email";
import { isValidTimeZone } from "@/lib/availability";

const LEAD_STATUSES = new Set(["new", "contacted", "scheduled", "won", "lost"]);

export async function addLead(formData: FormData) {
  await requirePlatformAdmin();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const note = String(formData.get("note") || "").trim().slice(0, 1000);
  if (!looksLikeEmail(email)) redirect("/cohort-admin/leads?error=email");

  // prismaSystem: leads are a platform table — there is no tenant to scope to.
  await prismaSystem.lead.create({
    data: { email, name, note, source: "manual" },
  });
  revalidatePath("/cohort-admin/leads");
  redirect("/cohort-admin/leads?added=1");
}

export async function setLeadStatus(formData: FormData) {
  await requirePlatformAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!LEAD_STATUSES.has(status)) redirect("/cohort-admin/leads");

  await prismaSystem.lead.update({ where: { id }, data: { status } });
  revalidatePath("/cohort-admin/leads");
  redirect("/cohort-admin/leads");
}

export async function removeLead(formData: FormData) {
  await requirePlatformAdmin();
  const id = String(formData.get("id"));
  await prismaSystem.lead.delete({ where: { id } });
  revalidatePath("/cohort-admin/leads");
  redirect("/cohort-admin/leads?removed=1");
}

// --- Recurring availability (the walkthrough calendar) ---

// "HH:MM" → minutes from midnight, or null if it isn't a time.
function parseHM(v: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? ""));
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins <= 24 * 60 ? mins : null;
}

export async function addAvailability(formData: FormData) {
  await requirePlatformAdmin();
  const weekdays = [...new Set(formData.getAll("weekday").map(Number))].filter(
    (d) => Number.isInteger(d) && d >= 1 && d <= 7,
  );
  const startMin = parseHM(formData.get("start"));
  const endMin = parseHM(formData.get("end"));
  const slotMinutes = Math.min(120, Math.max(10, Number(formData.get("slotMinutes")) || 20));
  const timezone = String(formData.get("timezone") || "");
  if (
    weekdays.length === 0 ||
    startMin === null ||
    endMin === null ||
    startMin + slotMinutes > endMin ||
    !isValidTimeZone(timezone)
  ) {
    redirect("/cohort-admin/walkthroughs?error=window");
  }

  // One rule per weekday keeps removal granular: dropping Wednesdays later
  // doesn't mean re-entering the rest of the week.
  const existing = await prismaSystem.availabilityRule.count();
  if (existing + weekdays.length > 50) redirect("/cohort-admin/walkthroughs?error=window");
  await prismaSystem.availabilityRule.createMany({
    data: weekdays.map((weekday) => ({ weekday, startMin, endMin, slotMinutes, timezone })),
  });
  revalidatePath("/cohort-admin/walkthroughs");
  revalidatePath("/book");
  redirect("/cohort-admin/walkthroughs?added=1");
}

export async function deleteAvailability(formData: FormData) {
  await requirePlatformAdmin();
  const id = String(formData.get("id"));
  // Removing a rule only stops OFFERING those times — existing bookings are
  // rows of their own and keep their appointments.
  await prismaSystem.availabilityRule.deleteMany({ where: { id } });
  revalidatePath("/cohort-admin/walkthroughs");
  revalidatePath("/book");
  redirect("/cohort-admin/walkthroughs?removed=1");
}

// --- Email blasts ---

const AUDIENCES = new Set(["open_leads", "all_leads", "owners"]);

async function audienceEmails(audience: string): Promise<string[]> {
  if (audience === "open_leads") {
    const rows = await prismaSystem.lead.findMany({
      where: { status: { in: ["new", "contacted", "scheduled"] } },
      select: { email: true },
    });
    return rows.map((r) => r.email);
  }
  if (audience === "all_leads") {
    const rows = await prismaSystem.lead.findMany({ select: { email: true } });
    return rows.map((r) => r.email);
  }
  // owners: one email per school's owner accounts — the customers.
  const rows = await prismaSystem.user.findMany({
    where: { role: "owner" },
    select: { email: true },
  });
  return rows.map((r) => r.email);
}

export async function sendBlast(formData: FormData) {
  await requirePlatformAdmin();
  const audience = String(formData.get("audience"));
  const subject = String(formData.get("subject") || "").trim().slice(0, 160);
  const body = String(formData.get("body") || "").trim().slice(0, 10000);
  const confirmed = formData.get("confirm") === "on";
  if (!AUDIENCES.has(audience) || !subject || !body || !confirmed) {
    redirect("/cohort-admin/email?error=incomplete");
  }

  // Identity + opt-out footer on every blast, appended by the system rather
  // than trusted to be remembered. Manual opt-out is honest at this scale:
  // replies land in the founder's inbox via the inbound forwarder.
  const text =
    `${body}\n\n—\nCohort · schoolcohort.com\n` +
    `You're receiving this because you talked to us or run a school on Cohort. ` +
    `Reply "unsubscribe" and a human will take you off the list.`;

  const emails = [...new Set(await audienceEmails(audience))];
  let sentCount = 0;
  // Sequential on purpose, same as notify.ts: one bad address cannot take the
  // rest down with it, and the volumes here are dozens, not thousands.
  for (const to of emails) {
    const res = await sendEmail({ to, subject, text });
    if (res.sent) sentCount++;
  }

  await prismaSystem.emailBlast.create({
    data: { audience, subject, body, sentCount },
  });
  revalidatePath("/cohort-admin/email");
  redirect(`/cohort-admin/email?sent=${sentCount}`);
}
