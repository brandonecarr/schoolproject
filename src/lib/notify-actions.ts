"use server";

// Notification mutations, shared by the teacher console and both portals.
// Auth is re-checked on every call and scoped to the caller's own rows — a
// notification is only ever readable or dismissible by its recipient.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const REFRESH = ["/notifications", "/parent/notifications", "/student/notifications", "/dashboard"];
const refreshAll = () => REFRESH.forEach((p) => revalidatePath(p));

// Open one notification: mark it read, then go where it points.
export async function openNotification(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const id = String(formData.get("id"));
  const fallback = String(formData.get("fallback") || "/");

  const n = await prisma.notification.findFirst({ where: { id, userId: session.user.id } });
  if (!n) redirect(fallback);
  if (!n.readAt) {
    await prisma.notification.update({
      where: { id },
      data: { readAt: new Date().toISOString() },
    });
  }
  refreshAll();
  redirect(n.linkPath || fallback);
}

export async function markAllNotificationsRead(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const back = String(formData.get("back") || "/notifications");
  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date().toISOString() },
  });
  refreshAll();
  redirect(back);
}

export async function clearReadNotifications(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const back = String(formData.get("back") || "/notifications");
  await prisma.notification.deleteMany({
    where: { userId: session.user.id, readAt: { not: null } },
  });
  refreshAll();
  redirect(back);
}
