"use server";

// Admin console actions. Every one starts with requirePlatformAdmin — the
// same rule as the pages, held by tests/admin.test.ts.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { looksLikeEmail, sendEmail } from "@/lib/email";

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

// --- Walkthrough slots ---

export async function addSlots(formData: FormData) {
  await requirePlatformAdmin();
  let isos: string[];
  try {
    isos = JSON.parse(String(formData.get("isos") || "[]"));
  } catch {
    redirect("/cohort-admin/walkthroughs");
  }
  const durationMin = Math.min(120, Math.max(10, Number(formData.get("durationMin")) || 20));
  const now = Date.now();
  const valid = isos
    .filter((s) => typeof s === "string" && !Number.isNaN(Date.parse(s)))
    .filter((s) => Date.parse(s) > now)
    .slice(0, 50);
  if (valid.length > 0) {
    await prismaSystem.walkthroughSlot.createMany({
      data: valid.map((iso) => ({ startsAt: new Date(iso), durationMin })),
    });
  }
  revalidatePath("/cohort-admin/walkthroughs");
  redirect("/cohort-admin/walkthroughs?added=1");
}

export async function deleteSlot(formData: FormData) {
  await requirePlatformAdmin();
  const id = String(formData.get("id"));
  // Only open slots: a booked slot is an appointment with a person, and
  // cancelling on them is a conversation, not a button.
  await prismaSystem.walkthroughSlot.deleteMany({ where: { id, leadId: null } });
  revalidatePath("/cohort-admin/walkthroughs");
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
