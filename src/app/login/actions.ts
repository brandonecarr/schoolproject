"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prismaSystem } from "@/lib/db";
import { verifyPassword, newSessionId, logAudit, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { currentSlug } from "@/lib/tenant-server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  // WHICH SCHOOL IS THIS SIGN-IN FOR?
  //
  // Email is unique per school, not globally, so an address can name more than
  // one account. The address in the browser answers it: on cedar-grove.<root>
  // only Cedar Grove accounts exist. That is also what stops a Cedar Grove
  // parent's credentials working on another school's subdomain — the lookup
  // never leaves this school.
  const slug = await currentSlug();
  // System: this IS authentication — no tenant exists until a credential
  // matches. The slug lookup and the candidate search are what decide it.
  let candidates;
  if (slug) {
    const school = await prismaSystem.school.findUnique({ where: { slug }, select: { id: true } });
    candidates = school
      ? await prismaSystem.user.findMany({ where: { schoolId: school.id, email } })
      : [];
  } else {
    // Untenanted: localhost, a preview URL, or tenancy not switched on. No
    // address to scope by, so match on the credentials and only proceed when
    // exactly one account is satisfied — signing someone into an arbitrary one
    // of several schools would be worse than asking.
    candidates = await prismaSystem.user.findMany({ where: { email } });
  }
  const matches = candidates.filter((u) => verifyPassword(password, u.password));

  if (matches.length === 0) {
    await logAudit(null, "login_failed", email);
    redirect("/login?e=bad");
  }
  if (matches.length > 1) {
    // Only reachable untenanted: the same address and password at two schools.
    await logAudit(null, "login_ambiguous", email);
    redirect("/login?e=ambiguous");
  }
  const user = matches[0];

  // System: creating the session is identity establishment, before any request
  // tenant exists to scope by.
  const sid = newSessionId();
  await prismaSystem.session.create({ data: { id: sid, userId: user.id } });
  await logAudit(user.id, "login", user.role);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);

  redirect("/");
}
