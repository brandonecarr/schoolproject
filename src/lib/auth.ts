// Auth: scrypt password hashing (no bcrypt native dep) + session cookies.
// Ported from the MVP's src/db.js password/session/audit code.
//
// Next 16 notes:
//  - cookies() is async and can only be *read* in Server Components; it can only
//    be *set/deleted* in Server Actions or Route Handlers (see login/logout
//    actions). So getSession() only reads here.
//  - Auth gating happens per-page via requireUser()/requireRole(), not in
//    proxy.ts — the Next 16 docs say proxy is for optimistic checks, not auth.

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { railForState, type Rail } from "@/lib/rules";
// Prisma 7's generator names row types `<Model>Model`; alias to the plain names.
import type { UserModel as User, SchoolModel as School } from "@/generated/prisma/models";

export const SESSION_COOKIE = "cohort_sid";

// Password + session-id helpers live in the Next-free lib/password.ts so the
// seed script can reuse them; re-exported here for server code convenience.
export { hashPassword, verifyPassword, newSessionId } from "@/lib/password";

// --- audit log (required by the written security program) ---
export async function logAudit(
  actorId: string | null,
  action: string,
  detail = ""
): Promise<void> {
  await prisma.audit.create({
    data: { at: new Date().toISOString(), actorId: actorId ?? null, action, detail },
  });
}

export type SchoolWithRail = School & { railLabel: string };

export type Session = {
  user: User;
  school: SchoolWithRail | null;
  rail: Rail | null;
};

// Read the current session from the cookie. Returns null if not signed in.
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) return null;

  const session = await prisma.session.findUnique({ where: { id: sid } });
  if (!session) return null;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;

  let school: SchoolWithRail | null = null;
  let rail: Rail | null = null;
  if (user.schoolId) {
    const s = await prisma.school.findUnique({ where: { id: user.schoolId } });
    if (s) {
      rail = railForState(s.state);
      school = { ...s, railLabel: rail ? rail.label : "No ESA program" };
    }
  }
  return { user, school, rail };
}

// Gate a page/action to any signed-in user. Redirects to /login otherwise.
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

// Gate to specific roles. "teacher" here means owner or teacher.
export async function requireRole(...roles: string[]): Promise<Session> {
  const session = await requireUser();
  if (!roles.includes(session.user.role)) redirect("/");
  return session;
}

// The teacher gate used everywhere in the console (owner or teacher).
export async function requireTeacher(): Promise<Session> {
  return requireRole("owner", "teacher");
}
