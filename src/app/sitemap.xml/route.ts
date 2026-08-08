// sitemap.xml — apex only, like robots.txt and for the same reason.
//
// The apex wants to be found; a school's subdomain must not be. A sitemap is
// an explicit invitation to crawl, so any host that is not the apex gets an
// empty 404 rather than a list of URLs — serving even an empty sitemap from a
// tenant host would confirm the host exists.
//
// A route handler rather than app/sitemap.ts because the metadata convention
// emits one static file per deployment and cannot vary by host. The proxy
// matcher excludes .xml, so this is reachable on every host and does its own
// gating.

import { NextResponse } from "next/server";
import { currentHostKind } from "@/lib/tenant-server";
import { multiTenant, rootDomain, tenantProtocol } from "@/lib/tenant-config";
import { statePages } from "@/lib/states";

export const dynamic = "force-dynamic";

export async function GET() {
  const kind = await currentHostKind();
  if (!multiTenant() || kind.kind !== "apex") {
    return new NextResponse("Not found", { status: 404 });
  }

  const origin = `${tenantProtocol()}://${rootDomain()}`;
  const urls = ["/", "/signup", "/states", ...statePages().map((s) => `/states/${s.slug}`)];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${origin}${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`;

  return new NextResponse(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
