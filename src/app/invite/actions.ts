"use server";

// Public: a parent accepts an invite link and sets their own password.
// This creates the parent account (verifiable-consent chain unchanged — the
// parent still creates the child's login afterward from their portal).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, newSessionId } from "@/lib/password";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, logAudit } from "@/lib/auth";
import { tokenUsable } from "@/lib/tokens";

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "").trim();

  const t = await prisma.token.findUnique({ where: { token } });
  if (!t || t.type !== "parent_invite" || !tokenUsable(t)) {
    redirect(`/invite/${token}?error=1`);
  }
  const email = (t.email || "").toLowerCase();
  // Scoped to the school that issued the invite. An address already in use at
  // another school is a different person's account there, or the same person
  // wearing a different hat, and neither blocks this one.
  const exists = await prisma.user.findUnique({
    where: { schoolId_email: { schoolId: t.schoolId, email } },
  });
  if (exists) redirect("/login"); // already claimed at this school

  const newUser = await prisma.user.create({
    data: {
      schoolId: t.schoolId,
      role: "parent",
      name: name || t.name || email,
      email,
      password: hashPassword(password),
      studentIdsJson: t.studentId ? JSON.stringify([t.studentId]) : null,
      consentGivenAt: new Date().toISOString(),
    },
  });
  await prisma.token.update({ where: { id: t.id }, data: { usedAt: new Date().toISOString() } });

  const sid = newSessionId();
  await prisma.session.create({ data: { id: sid, userId: newUser.id } });
  await logAudit(newUser.id, "invite_accepted", email);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
  redirect("/parent");
}
