// Daily Tier-1 sweep, triggered by Vercel Cron.
//
// This is a GET that writes, which contradicts the rule established when the
// /logout bug was fixed ("a destructive action must never be a GET"). The
// difference is what made that bug dangerous: /logout sat behind a <Link>, so a
// prefetch could fire it. This route is under /api, no link points at it, and it
// cannot be reached without a bearer secret. It is also not destructive — the
// worst a duplicate run does is re-fetch 29 pages and write nothing, because
// snapshots are only written when a fingerprint actually changes.
//
// Vercel Cron only issues GET, hence the shape. POST is accepted too so the
// sweep can be triggered by hand without pretending to be the scheduler.

import { NextResponse } from "next/server";
import { runSweep } from "@/lib/watch-run";

// Node runtime: the sweep uses node:crypto and needs a longer budget than the
// edge runtime allows.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed. With no secret configured the endpoint is disabled rather than
  // open — an unauthenticated fetch loop is a way to get our IP banned by a
  // state DOE, and a way for anyone to run up our bill.
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  // Constant-time-ish: compare full strings of equal length only.
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: process.env.CRON_SECRET ? "unauthorized" : "CRON_SECRET is not configured" },
      { status: process.env.CRON_SECRET ? 401 : 503 }
    );
  }

  const url = new URL(request.url);
  // ?only=az-esa,ia-esa — check a subset, for debugging a single source.
  const only = url.searchParams.get("only")?.split(",").map((s) => s.trim()).filter(Boolean);

  const report = await runSweep(only);

  // Summary only. The full text lives in SourceSnapshot; echoing it here would
  // put whole government pages into log storage every day for no benefit.
  return NextResponse.json({
    ...report,
    results: report.results.map((r) => ({
      sourceId: r.sourceId,
      status: r.status,
      httpStatus: r.httpStatus,
      changed: r.changed,
      escalated: r.escalated,
      magnitude: Number(r.magnitude.toFixed(3)),
      ...(r.error ? { error: r.error } : {}),
    })),
  });
}

export const GET = handle;
export const POST = handle;
