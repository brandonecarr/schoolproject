// GET /api/cron/purge — the nightly data-retention job.
//
// On Vercel, schedule this with a cron entry in vercel.json and set CRON_SECRET.
// Vercel sends `Authorization: Bearer <CRON_SECRET>`. A `?key=<CRON_SECRET>`
// query param is also accepted for manual runs. If CRON_SECRET is unset (local
// dev) the route runs unguarded.

import { NextResponse } from "next/server";
import { purgeAllSchools } from "@/lib/retention";
import { mayRunDestructiveJobs } from "@/lib/environment";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const key = new URL(req.url).searchParams.get("key");
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  // This job permanently deletes student records past the retention window.
  // A preview deployment sharing the production database must never run it.
  const allowed = mayRunDestructiveJobs();
  if (!allowed.ok) return NextResponse.json({ error: allowed.reason }, { status: 409 });

  const results = await purgeAllSchools();
  const total = results.reduce(
    (a, r) => a + r.attendance + r.observations + r.submissions + r.files,
    0
  );
  return NextResponse.json({ ok: true, purged: total, schools: results });
}
