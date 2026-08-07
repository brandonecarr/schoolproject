"use server";

// Public: create a new school + its owner account, and sign in. This is what
// makes the deployment multi-tenant at the application layer — every query is
// already scoped by schoolId. (Database-level row-level security is a separate
// step that requires the Postgres migration; see roadmap 6.2.)

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { availableSlug } from "@/lib/tenant";
import { hashPassword, newSessionId } from "@/lib/password";
import { SESSION_COOKIE, logAudit } from "@/lib/auth";

export async function signup(formData: FormData) {
  const schoolName = String(formData.get("schoolName") || "").trim();
  const state = String(formData.get("state") || "").trim().toUpperCase().slice(0, 2);
  const esaAmount = Number(formData.get("esaAmount")) || 0;
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!schoolName || !state || !name || !email || !password) {
    redirect("/signup?error=1");
  }
  // No duplicate check on the address any more. Signup CREATES a school, so
  // the new owner account is the first in an empty tenant and cannot collide
  // with anything — and a founder who already runs one microschool starting a
  // second is a real case this used to block outright.
  const slug = availableSlug(
    schoolName,
    (await prisma.school.findMany({ select: { slug: true } })).map((s) => s.slug)
  );
  if (!slug) redirect("/signup?error=slug");

  const school = await prisma.school.create({
    data: { name: schoolName, slug, state, esaAmount, address: "" },
  });
  const owner = await prisma.user.create({
    data: { schoolId: school.id, role: "owner", name, email, password: hashPassword(password) },
  });

  const sid = newSessionId();
  await prisma.session.create({ data: { id: sid, userId: owner.id } });
  await logAudit(owner.id, "school_created", `${schoolName} (${state})`);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sid, { httpOnly: true, path: "/", sameSite: "lax", maxAge: 604800 });
  redirect("/dashboard");
}
