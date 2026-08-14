// Resolve the tenant for the CURRENT REQUEST, at query time.
//
// This is the piece that makes row-level security actually enforce in Next's
// App Router. The obvious approach — getSession() calls enterWith(schoolId),
// every later query inherits it — does not work: AsyncLocalStorage mutations
// made with enterWith do not survive a React Server Component render boundary.
// Proven both ways: from a callee (getSession) and from an ancestor (the
// layout), the page's own queries still read unbound. See db.ts.
//
// So instead of pushing the tenant DOWN through ALS, the Prisma extension pulls
// it UP from the request when it needs it, using the primitives React DOES
// preserve across the render: cookies(). The session cookie names the session;
// the session names the user; the user names the school. That is the tenant.
//
// cache() memoises this for the life of one request, so a page firing ten
// queries resolves the cookie and the two lookups once, not ten times.
//
// FAIL CLOSED. Anything unexpected — no cookie, no session, or being called
// outside a request scope entirely (a background job that forgot to use
// withTenant) — returns null, and the extension then runs the query bare so
// the policies deny it. A thrown error here would 500 the page; a null denies
// the row. Denial is the safe direction.

import { cache } from "react";
import { cookies } from "next/headers";
import { sessionRowFor, userRowFor } from "@/lib/auth-rows";

// Mirrors SESSION_COOKIE in auth.ts. Inlined rather than imported to keep this
// module free of the auth → db → (dynamic) request-tenant chain; a divergence
// would only ever fail closed (no session found), never leak.
const SESSION_COOKIE = "cohort_sid";

export const resolveRequestTenant = cache(async (): Promise<string | null> => {
  try {
    const jar = await cookies();
    const sid = jar.get(SESSION_COOKIE)?.value;
    if (!sid) return null;

    // Read as system: this IS the tenant-resolution step, so it cannot itself
    // be tenant-scoped. The lookups come from auth-rows.ts — a per-request
    // cache shared with getSession(), so when the page has already resolved
    // who is signed in (it always has), these cost nothing. auth-rows uses
    // prismaSystem, which carries no ALS and never recurses back here.
    const session = await sessionRowFor(sid);
    if (!session) return null;

    const user = await userRowFor(session.userId);
    // Impersonation ("view as") stays within one school, so the signed-in
    // user's schoolId is the RLS tenant whether or not a view is active — no
    // need to chase viewingAsUserId here.
    return user?.schoolId ?? null;
  } catch {
    return null;
  }
});
