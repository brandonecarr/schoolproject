// Which tenant is the CODE currently acting for? (Not the request — the code.)
//
// This is the application half of row-level security. The database half is the
// policy set in prisma/migrations/*_rls_policies: every tenant table refuses
// rows unless the transaction carries `app.tenant_id` matching the row's
// schoolId, or `app.bypass_rls` for the handful of legitimate system paths.
// The Prisma extension in db.ts reads THIS context to decide which of those to
// set. No context at all means neither is set, and the database returns
// nothing — fail closed, so a forgotten call site shows up as an empty page in
// development rather than as another school's data in production.
//
// WHAT THIS DEFENDS AGAINST, precisely: an application bug — a findMany that
// forgot its `where: { schoolId }`, next year's feature written in a hurry. It
// does NOT defend against someone holding the connection string; they can set
// the GUC themselves. That is the correct threat model for RLS-as-backstop:
// the adversary is our own future code, not an attacker with the keys.
//
// THE THREE STATES:
//   tenant  — acting for one school. Set once per request by getSession(),
//             which is why nothing else ever needs to call this: every page
//             and action already begins with requireUser/requireTeacher.
//   system  — deliberately cross-tenant. Auth flows before a user exists,
//             cron jobs, the one sanctioned aggregate read. Every asSystem
//             call site is a place a reviewer should be able to stop and ask
//             "why is this allowed to see everything?" — keep them few.
//   none    — the default. Queries return nothing.

// No "server-only" marker, deliberately: db.ts imports this, half the lib
// directory imports db.ts, and the test suite imports those libs under
// vitest, where the marker throws. The node:async_hooks import below is its
// own guard — client bundles cannot resolve it, which is the same protection
// with a build error instead of a poisoned test run.
import { AsyncLocalStorage } from "node:async_hooks";

export type TenantContext =
  | { kind: "tenant"; tenantId: string }
  | { kind: "system" };

const store = new AsyncLocalStorage<TenantContext>();

export function currentTenantContext(): TenantContext | undefined {
  return store.getStore();
}

/** Run `fn` scoped to one school. Used where a request has no session to hang
 *  the tenant on — the iCal token route, the retention purge iterating
 *  schools — and in tests. */
export function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  // `async () => await fn()`, not `fn`. Prisma operations are lazy: they run
  // when the returned promise is awaited, not when it is created. If fn is a
  // one-liner like `() => prisma.x.count()` with no internal await, run()
  // returns that promise unstarted and the query executes AFTER the scope has
  // exited — the extension then reads no context and the row is denied. The
  // inner await forces the query to start while the scope is still open.
  return store.run({ kind: "tenant", tenantId }, async () => await fn());
}

/**
 * Run a CODE BLOCK under the bypass flag — for work that itself calls `prisma`
 * internally and must span schools, i.e. the cron jobs (runSweep,
 * runInterpretation). The queries live INSIDE fn, so run()'s scope reliably
 * covers them.
 *
 * For a single bypass query, do NOT use this — use the `prismaSystem` client
 * from db.ts. run() followed by enterTenant does not propagate to a caller's
 * continuation (see db.ts), which is why session resolution and the auth flows
 * read through prismaSystem instead.
 *
 * The justification belongs AT THE CALL SITE. If you cannot write "this must
 * see across schools because …", it must not be asSystem.
 */
export function asSystem<T>(fn: () => Promise<T>): Promise<T> {
  return store.run({ kind: "system" }, async () => await fn());
}

/**
 * Bind the tenant to the REST of the current request.
 *
 * getSession() calls this after resolving who is signed in, so the page or
 * action that awaited it — and everything that page awaits afterwards —
 * queries as that school without any call-site changes. enterWith() rather
 * than run() because getSession cannot wrap its caller's remaining body.
 *
 * The subtlety that makes this correct here and wrong elsewhere: enterWith
 * binds the store to the current async execution and its continuations. Code
 * that awaited getSession() IS such a continuation. A sibling React component
 * rendered in parallel is NOT — but this codebase's server components each
 * call requireUser/requireTeacher themselves, so each render body gets its own
 * binding. A future component that queries the database without going through
 * a require* first will read empty — which is fail-closed doing its job, not
 * a bug in this file.
 */
export function enterTenant(tenantId: string): void {
  store.enterWith({ kind: "tenant", tenantId });
}
