"use server";

// Public: a user sets a new password from a one-time reset link.

import { redirect } from "next/navigation";
import { prismaSystem } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { logAudit } from "@/lib/auth";
import { tokenUsable } from "@/lib/tokens";

export async function acceptReset(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");

  // System: the token IS the authentication; nothing is scoped until it
  // resolves. Everything after runs as the school the token names.
  const t = await prismaSystem.token.findUnique({ where: { token } });
  if (!t || t.type !== "password_reset" || !t.userId || !tokenUsable(t)) {
    redirect(`/reset/${token}?error=1`);
  }
  // System: a password reset is authenticated by the token, not a session, so
  // there is no request tenant to scope by. The token named the school.
  await prismaSystem.user.update({ where: { id: t.userId }, data: { password: hashPassword(password) } });
  await prismaSystem.token.update({ where: { id: t.id }, data: { usedAt: new Date().toISOString() } });
  await logAudit(t.userId, "password_reset", "");
  redirect("/login?reset=1");
}
