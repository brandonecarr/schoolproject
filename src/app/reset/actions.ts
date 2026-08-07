"use server";

// Public: a user sets a new password from a one-time reset link.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { asSystem, enterTenant } from "@/lib/tenant-context";
import { hashPassword } from "@/lib/password";
import { logAudit } from "@/lib/auth";
import { tokenUsable } from "@/lib/tokens";

export async function acceptReset(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");

  // System: the token IS the authentication; nothing is scoped until it
  // resolves. Everything after runs as the school the token names.
  const t = await asSystem(() => prisma.token.findUnique({ where: { token } }));
  if (!t || t.type !== "password_reset" || !t.userId || !tokenUsable(t)) {
    redirect(`/reset/${token}?error=1`);
  }
  enterTenant(t.schoolId);
  await prisma.user.update({ where: { id: t.userId }, data: { password: hashPassword(password) } });
  await prisma.token.update({ where: { id: t.id }, data: { usedAt: new Date().toISOString() } });
  await logAudit(t.userId, "password_reset", "");
  redirect("/login?reset=1");
}
