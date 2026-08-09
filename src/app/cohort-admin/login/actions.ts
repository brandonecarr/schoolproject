"use server";

// Admin sign-in on the apex. Deliberately NOT gated by requirePlatformAdmin —
// this is the gate's door (tests/admin.test.ts exempts this directory for
// exactly that reason).
//
// The school login scopes candidates by subdomain; there is no subdomain
// here, so the scope is the flag itself: only accounts someone granted
// platformAdmin via scripts/grant-admin.mjs are even considered. A correct
// password on any non-admin account fails identically to a wrong one.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prismaSystem } from "@/lib/db";
import { verifyPassword, newSessionId } from "@/lib/password";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";

export async function adminLogin(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  // System: this IS authentication, and the flag is the scope.
  const candidates = await prismaSystem.user.findMany({
    where: { email, platformAdmin: true },
  });
  const user = candidates.find((c) => verifyPassword(password, c.password));
  if (!user) redirect("/cohort-admin/login?error=1");

  const sid = newSessionId();
  await prismaSystem.session.create({ data: { id: sid, userId: user.id } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
  redirect("/cohort-admin");
}
