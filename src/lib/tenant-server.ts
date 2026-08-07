// Which school is this request addressed to?
//
// Read from the Host header, on every request, in the same way proxy.ts reads
// it. It would be conventional for the proxy to resolve the tenant once and
// forward it as an x-tenant header, and that is exactly what is NOT done here.
// A forwarded header is a second source of truth that has to be stripped from
// inbound requests or it becomes forgeable, and it silently stops being set the
// moment a route falls outside the proxy matcher. Reading the Host directly
// costs a string split and cannot drift from what the browser actually asked
// for.
//
// Neither this nor the proxy decides who is allowed in. The Host names a
// tenant; the session cookie names a person. Authorisation is still
// getSession/requireUser, and the tenant check there is an ADDITIONAL gate, not
// a replacement for one.

import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { classifyHost, type HostKind } from "@/lib/tenant";
import { originFor, rootDomain } from "@/lib/tenant-config";

export async function currentHost(): Promise<string> {
  const h = await headers();
  // x-forwarded-host is what a proxy in front of us (Vercel's edge) rewrites
  // the original Host to; when both exist that one is the address the browser
  // typed, which is the one tenancy is keyed on.
  return h.get("x-forwarded-host") || h.get("host") || "";
}

export async function currentHostKind(): Promise<HostKind> {
  return classifyHost(await currentHost(), rootDomain());
}

/** The school slug this request is addressed to, or null when the address does
 *  not name one (apex, preview URL, localhost, tenancy switched off). */
export async function currentSlug(): Promise<string | null> {
  const kind = await currentHostKind();
  return kind.kind === "tenant" ? kind.slug : null;
}

/**
 * The origin this request actually arrived on.
 *
 * For links a person will copy out of the page and paste somewhere else: an
 * iCal subscription URL, an invite link a teacher texts to a parent. Those have
 * to be absolute, and they have to be the address the school is already using —
 * which is exactly the address this request came in on, in every mode. On a
 * subdomain it is the school's own; untenanted it is whatever host the
 * deployment answers to; on a preview URL it is that preview.
 */
export async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = await currentHost();
  return `${protocolFor(host, h.get("x-forwarded-proto"))}://${host}`;
}

/**
 * http or https, from the proxy header when there is one and the hostname when
 * there isn't.
 *
 * The hostname test is not `startsWith("localhost")`: with tenancy switched on
 * locally the host is cedar-grove.localhost:3000, which does not start with it
 * and would be handed an https origin that nothing is listening on. Every
 * loopback shape has to count.
 */
function protocolFor(host: string, forwarded: string | null): string {
  if (forwarded) return forwarded.split(",")[0].trim();
  const name = host.split(":")[0].toLowerCase();
  const local =
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name === "127.0.0.1" ||
    name === "[::1]" ||
    name === "0.0.0.0";
  return local ? "http" : "https";
}

// Re-exported so callers have one tenancy import. The implementation lives in
// tenant-config because it needs no request — background jobs and the email
// sender have a school but no Host header.
export { originFor } from "@/lib/tenant-config";

/**
 * Move a tokenised link to the school it belongs to.
 *
 * Invite and reset links live in people's inboxes for days and point at
 * whatever origin sent them — including the apex, for every link sent before
 * tenancy existed. Following one there would create an account and drop the
 * session cookie on the apex, where the tenant gate refuses it: the person
 * would complete signup and land back at a sign-in page with a working password
 * and no idea where to use it.
 *
 * The token row knows its school, so the page can look up where the link should
 * have gone and send the browser on. Does nothing off the apex, which is the
 * normal case.
 */
export async function redirectTokenToTenant(schoolId: string, path: string): Promise<void> {
  const kind = await currentHostKind();
  if (kind.kind !== "apex") return;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { slug: true },
  });
  const origin = school ? originFor(school.slug) : null;
  redirect(origin ? `${origin}${path}` : "/");
}
