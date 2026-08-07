"use server";

// Start and stop "view as".
//
// Lives outside both route groups because stopping has to work while the
// session is already impersonating — at which point the teacher group's
// requireTeacher() gate would refuse, since the current role is parent or
// student. Starting is staff-gated normally.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getSession, logAudit, requireTeacher, isStaffRole, SESSION_COOKIE } from "@/lib/auth";

export async function startViewAs(formData: FormData) {
  const { user, school } = await requireTeacher();
  const targetId = String(formData.get("userId") || "");
  const back = String(formData.get("back") || "/students");

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  // Same school, and never another staff account. A teacher peering into the
  // owner's console through this door would be privilege escalation wearing a
  // support-tool label.
  if (!target || target.schoolId !== school?.id || isStaffRole(target.role)) {
    redirect(`${back}?viewas=denied`);
  }

  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) redirect("/login");

  await prisma.session.update({ where: { id: sid }, data: { viewingAsUserId: target.id } });
  // Audited on the way IN as well as out: "who looked at this family's account,
  // and when" is a question a school may one day have to answer.
  await logAudit(user.id, "view_as_started", `${target.role} ${target.name} (${target.email})`);

  redirect(target.role === "student" ? "/student" : "/parent");
}

export async function stopViewAs() {
  const session = await getSession();
  if (!session) redirect("/login");

  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) await prisma.session.update({ where: { id: sid }, data: { viewingAsUserId: null } });

  // Attribute to the staff member, never the person being viewed.
  if (session.actor) {
    await logAudit(session.actor.id, "view_as_stopped", `${session.user.role} ${session.user.name}`);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
