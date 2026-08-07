// POST /logout — clears the session.
//
// This MUST NOT be a GET. Signing out destroys state, and a destructive GET
// sitting behind a <Link> is a footgun: Next prefetches links, browsers
// speculatively preload them, and scanners follow them — any of which silently
// ends the user's session. That is exactly the bug this replaced, where the
// "Sign out" link in the sidebar could log a teacher out just from being near
// the links they were trying to click.
//
// The nav now posts a form here instead. Route handlers are one of the two
// places Next 16 allows cookie mutation.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) {
    await prisma.session.deleteMany({ where: { id: sid } });
    jar.delete(SESSION_COOKIE);
  }
  // 303 so the browser follows with a GET rather than re-posting.
  return NextResponse.redirect(new URL("/login", request.url), 303);
}

// A GET here is never a real sign-out attempt — it's a prefetch, a preload, or
// someone pasting the URL. Send them to the login page WITHOUT touching the
// session, so a stray fetch can't end it.
export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/login", request.url));
}
