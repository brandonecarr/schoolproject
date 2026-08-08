// Routing by address: what belongs on the apex, what belongs on a school's own
// subdomain, and what belongs on neither.
//
// This file makes no security decisions. The Next docs are explicit that proxy
// is for optimistic checks and not for auth, and the tenant gate that actually
// matters lives in getSession() — a request that gets past this file with a
// cookie for the wrong school is still refused there. What this does is stop
// people landing on a page that cannot possibly work: the teacher console on
// the marketing domain, or the signup form on a school's own address.
//
// No database, no session read, no await. It runs on every request.

import { NextResponse, type NextRequest } from "next/server";
import { classifyHost } from "@/lib/tenant";
import { rootDomain, tenantProtocol } from "@/lib/tenant-config";

/**
 * Paths the apex serves. Everything else there belongs to a school and has no
 * meaning without one.
 *
 * An allowlist rather than a blocklist of app routes, because the app has ~40
 * routes and gains more every phase — a blocklist would silently stop covering
 * the newest one, which is the one most likely to leak.
 */
const APEX_PATHS = [
  "/", // landing + signup entry
  "/signup",
  "/states", // public per-state program pages — the part of the apex built to be found
  "/logout",
  "/api", // cron and webhooks are called at the production domain
  // Tokenised links. Old emails point at whatever origin sent them, and the
  // token row knows its school — these pages redirect themselves to the right
  // subdomain once they've looked it up.
  "/invite",
  "/reset",
];

const onList = (path: string, list: string[]) =>
  list.some((p) => path === p || (p !== "/" && path.startsWith(p + "/")));

/**
 * Keep a school's own address out of search results.
 *
 * robots.txt asks a crawler not to fetch; this tells it not to index what it
 * has. Both are needed — a Disallowed URL can still be listed from an inbound
 * link, and what would be listed is the school's NAME on its sign-in page. A
 * directory of "schools using Cohort", assembled by Google out of our
 * subdomains, is a customer list we published without deciding to.
 *
 * The apex is the exception: it is the one page that wants to be found.
 */
function noindex(): NextResponse {
  const res = NextResponse.next();
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

export function proxy(request: NextRequest) {
  const root = rootDomain();
  // Tenancy off: one school per deployment, nothing to route. Still not for
  // search — untenanted means a preview URL or a laptop.
  if (!root) return noindex();

  const url = request.nextUrl;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const kind = classifyHost(host, root);
  // http only when ROOT_DOMAIN is a localhost address, for trying this locally.
  const apex = `${tenantProtocol()}://${root}`;

  // A hostname under our domain that is not a school — mail.<root>, a typo
  // caught by the wildcard record, a probe. Send it to the front door rather
  // than rendering anything.
  if (kind.kind === "invalid") {
    return NextResponse.redirect(new URL("/", apex));
  }

  // Preview deployments, localhost, an IP. We cannot tell which school this is
  // for, so behave exactly as the untenanted app always has.
  if (kind.kind === "unknown") return noindex();

  if (kind.kind === "apex") {
    if (onList(url.pathname, APEX_PATHS)) return NextResponse.next();
    // Someone's bookmark of the app on the bare domain. There is no way to
    // know which school they meant, so the landing page asks.
    const to = url.clone();
    to.pathname = "/";
    to.search = url.pathname === "/login" ? "?signin=1" : "";
    return NextResponse.redirect(to);
  }

  // A school's own address. Signing up creates a school and so cannot happen
  // inside one.
  if (url.pathname === "/signup" || url.pathname.startsWith("/signup/")) {
    return NextResponse.redirect(new URL("/signup", apex));
  }
  return noindex();
}

export const config = {
  // Everything except Next's own assets and the files served straight off the
  // filesystem. Note /api IS matched: cron routes need the apex allowance
  // above, and a school's API routes need the same tenant gate as its pages.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
