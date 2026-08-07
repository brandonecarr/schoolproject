// Where tenancy gets its one piece of deployment knowledge: the root domain.
//
// Deliberately its own module rather than part of tenant.ts (which is pure) or
// tenant-server.ts (which is "server-only"). proxy.ts needs this and cannot
// import a "server-only" module, and tenant.ts stays testable without touching
// process.env.
//
// ROOT_DOMAIN unset is a supported state, not a misconfiguration. It means
// "run untenanted" — one school per deployment, which is how a laptop, a
// preview URL, and this app's current production deployment all work. Setting
// it is what turns subdomain tenancy on, and it should be set only once the
// wildcard DNS record and certificate actually exist. Turning it on before
// then would send every school to an address that doesn't resolve.

import { tenantOrigin } from "@/lib/tenant";

/** e.g. "cohort.school", or "localhost:3000" to try tenancy locally. Empty
 *  when tenancy is off. */
export function rootDomain(): string {
  return (process.env.ROOT_DOMAIN || "").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}

/** Is this deployment serving more than one school on its own address? */
export function multiTenant(): boolean {
  return rootDomain() !== "";
}

/** https in production, http for a local ROOT_DOMAIN=localhost:3000. */
export function tenantProtocol(): string {
  return rootDomain().startsWith("localhost") ? "http" : "https";
}

/**
 * A school's own origin, for links that leave the request that made them —
 * an email, a background job.
 *
 * Null when tenancy is off, because then there is only one origin and the
 * caller has a better source for it (the request itself, or APP_URL).
 */
export function originFor(slug: string): string | null {
  const root = rootDomain();
  return root ? tenantOrigin(slug, root, tenantProtocol()) : null;
}
