// The other half of the signup handoff: redeem a one-time token and set the
// session cookie on the school's own host.
//
// A GET that mutates, which the rest of this app refuses to do. The exception
// is deliberate and matches the invite and reset links already here: a browser
// following a redirect can only issue a GET, and the alternative — an
// auto-submitting form — is the same thing with worse failure modes. What makes
// it safe is that the token is single-use, expires in two minutes, and creates
// a session for exactly the account it was minted for. It destroys nothing.
//
// Four things are checked before a cookie is set, and all four have to hold:
//   - the token exists, is of this type, is unused and unexpired
//   - it names a user
//   - that user still belongs to the token's school
//   - the ADDRESS this request arrived on is that school's own address
//
// The last one is the tenant check. Without it a handoff minted for one school
// could be redeemed on another school's subdomain, which is the exact boundary
// this whole phase exists to hold.

import { NextResponse, type NextRequest } from "next/server";
import { prismaSystem } from "@/lib/db";
import { tokenUsable } from "@/lib/tokens";
import { newSessionId, SESSION_COOKIE, SESSION_COOKIE_OPTIONS, logAudit } from "@/lib/auth";
import { currentHostKind, currentOrigin } from "@/lib/tenant-server";

export const dynamic = "force-dynamic";

/** Every failure lands here. No detail about which check failed: the person
 *  holding a bad token learns nothing, and the person holding a good one is
 *  already signed in. */
async function refuse() {
  return NextResponse.redirect(new URL("/login?e=expired", await currentOrigin()));
}

export async function GET(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("t") || "";
  if (!value) return refuse();

  // System: the handoff token IS the authentication. The moment it resolves,
  // its school is the tenant for every check and write below.
  const token = await prismaSystem.token.findUnique({ where: { token: value } });
  if (!token || token.type !== "signin_handoff" || !token.userId || !tokenUsable(token)) {
    return refuse();
  }
  const user = await prismaSystem.user.findUnique({ where: { id: token.userId } });
  if (!user || user.schoolId !== token.schoolId) return refuse();

  // The handoff exists to land the cookie on the school's own host, so with
  // tenancy on this must BE that host — not merely "not some other school's".
  // Redeeming it on the apex would set a cookie the tenant gate then refuses,
  // and the founder would arrive at a sign-in page having just signed up.
  const kind = await currentHostKind();
  if (kind.kind !== "unknown") {
    const school = await prismaSystem.school.findUnique({
      where: { id: token.schoolId },
      select: { slug: true },
    });
    if (kind.kind !== "tenant" || school?.slug !== kind.slug) return refuse();
  }

  // Burn it first. If anything below fails the token is still spent, which is
  // the safe direction — a second attempt gets the sign-in page rather than a
  // second chance at the same link.
  // System: this is session establishment authenticated by the handoff token.
  const burned = await prismaSystem.token.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: new Date().toISOString() },
  });
  // Two tabs racing on the same link. Exactly one wins.
  if (burned.count !== 1) return refuse();

  const sid = newSessionId();
  await prismaSystem.session.create({ data: { id: sid, userId: user.id } });
  await logAudit(user.id, "login", `${user.role} (signup handoff)`);

  // Straight to the console with the first-run notice. Handoff tokens are only
  // minted at signup, so the person holding one is always a brand-new owner.
  const response = NextResponse.redirect(new URL("/dashboard?welcome=1", await currentOrigin()));
  response.cookies.set(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
  return response;
}
