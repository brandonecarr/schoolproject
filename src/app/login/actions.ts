"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, newSessionId, logAudit, SESSION_COOKIE } from "@/lib/auth";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  // Email is unique per school now, so an address can match more than one
  // account. Until the subdomain middleware lands (9.3) there is no tenant on
  // this request to scope by, so match on the credentials and only proceed
  // when exactly one account is satisfied. Signing someone into an arbitrary
  // one of several schools would be worse than asking.
  const candidates = await prisma.user.findMany({ where: { email } });
  const matches = candidates.filter((u) => verifyPassword(password, u.password));

  if (matches.length === 0) {
    await logAudit(null, "login_failed", email);
    redirect("/login?e=" + encodeURIComponent("That email and password don't match an account."));
  }
  if (matches.length > 1) {
    // Same address and password at two schools. Rare, but the only honest
    // answer is to send them to the school's own address rather than guess.
    await logAudit(null, "login_ambiguous", email);
    redirect(
      "/login?e=" +
        encodeURIComponent("That sign-in works at more than one school — open your school's own address.")
    );
  }
  const user = matches[0];

  const sid = newSessionId();
  await prisma.session.create({ data: { id: sid, userId: user.id } });
  await logAudit(user.id, "login", user.role);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, sid, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 604800, // 7 days
  });

  redirect("/");
}
