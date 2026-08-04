// GET /logout — clears the session (the sidebar/topnav link here). Route
// handlers are one of the two places Next 16 allows cookie mutation.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth";

export async function GET(request: Request) {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) {
    await prisma.session.deleteMany({ where: { id: sid } });
    jar.delete(SESSION_COOKIE);
  }
  return NextResponse.redirect(new URL("/login", request.url));
}
