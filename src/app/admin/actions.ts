"use server";

// Admin console actions. Every one starts with requirePlatformAdmin — the
// same rule as the pages, held by tests/admin.test.ts.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { looksLikeEmail } from "@/lib/email";

const LEAD_STATUSES = new Set(["new", "contacted", "scheduled", "won", "lost"]);

export async function addLead(formData: FormData) {
  await requirePlatformAdmin();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const note = String(formData.get("note") || "").trim().slice(0, 1000);
  if (!looksLikeEmail(email)) redirect("/admin/leads?error=email");

  // prismaSystem: leads are a platform table — there is no tenant to scope to.
  await prismaSystem.lead.create({
    data: { email, name, note, source: "manual" },
  });
  revalidatePath("/admin/leads");
  redirect("/admin/leads?added=1");
}

export async function setLeadStatus(formData: FormData) {
  await requirePlatformAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!LEAD_STATUSES.has(status)) redirect("/admin/leads");

  await prismaSystem.lead.update({ where: { id }, data: { status } });
  revalidatePath("/admin/leads");
  redirect("/admin/leads");
}

export async function removeLead(formData: FormData) {
  await requirePlatformAdmin();
  const id = String(formData.get("id"));
  await prismaSystem.lead.delete({ where: { id } });
  revalidatePath("/admin/leads");
  redirect("/admin/leads?removed=1");
}
