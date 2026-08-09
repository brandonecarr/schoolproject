// POST /api/beacon — the marketing pages' view counter.
//
// Deliberately the smallest honest analytics possible: a day, a path, a
// referrer HOSTNAME, +1. No IP, no user agent, no fingerprint, no cookie —
// there is nothing here a privacy policy would need a paragraph for. Bots
// are counted too; the Marketing tab says so instead of pretending.
//
// The allowlist is the boundary that matters: only the public marketing
// surfaces count. App paths — a school's pages, a child's anything — can
// never enter this table even if someone POSTs them.

import { NextResponse } from "next/server";
import { prismaSystem } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = (path: string): boolean =>
  path === "/" ||
  path === "/book" ||
  path === "/find" ||
  path === "/states" ||
  /^\/states\/[a-z-]{2,40}$/.test(path);

export async function POST(request: Request) {
  let body: { path?: string; referrer?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const path = String(body.path ?? "");
  if (!ALLOWED(path)) return NextResponse.json({ ok: true });

  let referrerHost = "";
  try {
    const host = new URL(String(body.referrer ?? "")).hostname.toLowerCase().slice(0, 100);
    // Internal navigation is not a referral.
    const own = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
    if (host && host !== own && !host.endsWith(`.${own}`)) referrerHost = host;
  } catch {
    // No or unparseable referrer: counted, just unattributed.
  }

  const day = new Date().toISOString().slice(0, 10);
  // prismaSystem: platform table; the write is an anonymous aggregate bump.
  await prismaSystem.pageView.upsert({
    where: { day_path_referrerHost: { day, path, referrerHost } },
    create: { day, path, referrerHost, count: 1 },
    update: { count: { increment: 1 } },
  });
  return NextResponse.json({ ok: true });
}
