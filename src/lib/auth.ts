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
import { currentHostKind } from "@/lib/tenant-server";
// Prisma 7's generator names row types `<Model>Model`; alias to the plain names.
import type { UserModel as User, SchoolModel as School } from "@/generated/prisma/models";

export const SESSION_COOKIE = "cohort_sid";

/** Owner or teacher. Defined here because getSession needs it before the
 *  messages module is reachable. */
export const isStaffRole = (role: string) => role === "owner" || role === "teacher";

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
  /** Whose view this is. While impersonating, this is the FAMILY member — so
   *  every existing role check, page gate and query scopes to them without a
   *  single call site changing. */
  user: User;
  school: SchoolWithRail | null;
  rail: Rail | null;
  /** The staff member actually driving, when impersonating. Null normally.
   *  Audit entries are attributed to this person, never the person being
   *  viewed — otherwise the log would record a parent doing things they didn't. */
  actor: User | null;
};

// Read the current session from the cookie. Returns null if not signed in.
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) return null;

  const session = await prisma.session.findUnique({ where: { id: sid } });
  if (!session) return null;

  const signedIn = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!signedIn) return null;

  // Impersonation. The swap happens HERE, once, so that every downstream role
  // check, page gate and scoped query sees the family member and needs no
  // knowledge of this feature. Re-validated on every request rather than
  // trusted from when it started: if the staff member's role changed, or the
  // target moved school, the view ends immediately.
  let user = signedIn;
  let actor: User | null = null;
  if (session.viewingAsUserId) {
    const target = await prisma.user.findUnique({ where: { id: session.viewingAsUserId } });
    if (
      target &&
      isStaffRole(signedIn.role) &&
      target.schoolId === signedIn.schoolId &&
      !isStaffRole(target.role)
    ) {
      user = target;
      actor = signedIn;
    } else {
      // Anything unexpected — target deleted, promoted to staff, moved school —
      // drops the view rather than guessing. Failing open into someone else's
      // account is the one outcome that must never happen.
      await prisma.session.update({ where: { id: sid }, data: { viewingAsUserId: null } });
    }
  }

  let school: SchoolWithRail | null = null;
  let rail: Rail | null = null;
  if (user.schoolId) {
    const s = await prisma.school.findUnique({ where: { id: user.schoolId } });
    if (s) {
      rail = railForState(s.state);
      school = { ...s, railLabel: rail ? rail.label : "No ESA program" };
    }
  }

  // TENANT GATE. When the request arrives on a school's own address, the
  // session must belong to that school.
  //
  // The browser already makes this hard to violate: the cookie is set without a
  // Domain attribute, so it is host-only and cedar-grove.<root> and
  // oak-hill.<root> have separate jars. That is a property of how the cookie
  // happens to be set, in another file, and nothing would fail if someone added
  // a domain to widen it. This is the check that would.
  //
  // It also covers the case the cookie jar cannot: a session that was valid
  // here and no longer is, because the account moved school or the school's
  // slug changed. Re-checked on every request rather than at sign-in.
  const kind = await currentHostKind();
  if (kind.kind === "tenant" && school?.slug !== kind.slug) return null;
  // On the apex there is no school, so there is no app to be signed into. The
  // proxy already routes app paths away from there; this makes it true even if
  // a route slips the matcher.
  if (kind.kind === "apex") return null;

  return { user, school, rail, actor };
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

/**
 * Refuse a write while someone is being viewed.
 *
 * "View as" is for answering "what does this parent actually see?", not for
 * doing things on their behalf. A support tool that can act as a user is an
 * impersonation tool, and every action it takes lands in that person's record
 * under their name.
 *
 * Teacher-console actions need no call here: impersonation swaps in a
 * parent/student, so requireTeacher() already refuses. This is for the portal
 * actions, which the viewed user legitimately can call. Every one of them must
 * call it, and tests/view-as.test.ts fails the build if one doesn't.
 */
export async function requireNotViewing(session: Session, back = "/"): Promise<void> {
  if (session.actor) redirect(`${back}?viewonly=1`);
}

// The teacher gate used everywhere in the console (owner or teacher).
export async function requireTeacher(): Promise<Session> {
  return requireRole("owner", "teacher");
}
