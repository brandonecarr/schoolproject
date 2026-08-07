// robots.txt, which has to differ by host.
//
// The apex is a marketing page and wants to be found. A school's subdomain is
// not: cedar-grove.schoolcohort.com should never appear in a search result.
// Nothing there is readable without a session, so the crawler only ever reaches
// a sign-in page — but that sign-in page carries the school's NAME, and a list
// of "schools using Cohort" assembled by Google out of our subdomains is a
// customer list we published by accident.
//
// A route handler rather than app/robots.ts because the metadata convention
// generates one static file for the whole deployment and cannot vary by host.
// The proxy matcher deliberately excludes .txt so this is reachable on every
// host, apex included.

import { NextResponse } from "next/server";
import { currentHostKind } from "@/lib/tenant-server";
import { multiTenant } from "@/lib/tenant-config";

export const dynamic = "force-dynamic";

const NO = "User-agent: *\nDisallow: /\n";

export async function GET() {
  const kind = await currentHostKind();

  // Untenanted — a preview deployment or a laptop. Neither should be indexed,
  // and a preview URL that is is worse than a school subdomain that is.
  if (!multiTenant() || kind.kind !== "apex") {
    return new NextResponse(NO, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const body = [
    "User-agent: *",
    "Allow: /$",
    "Allow: /signup",
    // Everything else on the apex is a redirect back to "/" or a tokenised
    // link, and neither is worth a crawl budget.
    "Disallow: /invite/",
    "Disallow: /reset/",
    "Disallow: /enter",
    "Disallow: /api/",
    "",
  ].join("\n");

  return new NextResponse(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
