"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, newSessionId, logAudit, SESSION_COOKIE } from "@/lib/auth";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.password)) {
    await logAudit(null, "login_failed", email);
    redirect("/login?e=" + encodeURIComponent("That email and password don't match an account."));
  }

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
