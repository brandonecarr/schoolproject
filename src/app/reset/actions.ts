"use server";

// Public: a user sets a new password from a one-time reset link.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { logAudit } from "@/lib/auth";
import { tokenUsable } from "@/lib/tokens";

export async function acceptReset(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");

  const t = await prisma.token.findUnique({ where: { token } });
  if (!t || t.type !== "password_reset" || !t.userId || !tokenUsable(t)) {
    redirect(`/reset/${token}?error=1`);
  }
  await prisma.user.update({ where: { id: t.userId }, data: { password: hashPassword(password) } });
  await prisma.token.update({ where: { id: t.id }, data: { usedAt: new Date().toISOString() } });
  await logAudit(t.userId, "password_reset", "");
  redirect("/login?reset=1");
}
