// Tier 2, on a schedule: interpret whatever Tier 1 flagged.
//
// A separate route and a separate cron entry from the sweep, so an Anthropic
// outage or a missing key can never stop us DETECTING that a state's page moved.
// Detection is the part that must not fail; interpretation can wait a day.
//
// Same auth posture as the sweep: bearer secret, fail closed. See the note in
// /api/cron/watch-sources about why a GET may write here.

import { NextResponse } from "next/server";
import { asSystem } from "@/lib/tenant-context";
import { runInterpretation } from "@/lib/interpret-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
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

  // Opening a pull request is a write to an external repository, so it is
  // opt-in per run AND requires GITHUB_TOKEN. Without ?pr=1 the job only stores
  // proposals for review in /proposals.
  const openPr = new URL(request.url).searchParams.get("pr") === "1";
  // System: rule interpretation is platform work — it belongs to no school.
  const report = await asSystem(() => runInterpretation({ openPr }));
  return NextResponse.json(report);
}

export const GET = handle;
export const POST = handle;
