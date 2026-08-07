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
import { classifyHost, tenantOrigin, type HostKind } from "@/lib/tenant";
import { rootDomain, tenantProtocol } from "@/lib/tenant-config";

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

/** A school's own origin, for links that have to leave this host. Returns null
 *  when tenancy is off, because then there is only one origin and the caller
 *  should use relative paths. */
export function originFor(slug: string): string | null {
  const root = rootDomain();
  return root ? tenantOrigin(slug, root, tenantProtocol()) : null;
}

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
