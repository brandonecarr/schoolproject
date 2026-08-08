// Prisma client singleton.
//
// Prisma 7 connects through a driver adapter. We use the node-postgres adapter
// (@prisma/adapter-pg) against a Postgres database:
//  - locally + in production this points at Supabase (DATABASE_URL).
//  - on Vercel (serverless) DATABASE_URL should be the Supabase *transaction
//    pooler* connection string (port 6543); migrations use the *direct*
//    connection (DIRECT_URL, port 5432) via prisma.config.ts.
//
// Next.js dev mode hot-reloads modules, so cache the client on globalThis to
// avoid exhausting connections. Replaces the Express MVP's JSON store (src/db.js).
//
// CONSTRUCTED LAZILY, AND THAT MATTERS AT BUILD TIME.
//
// This used to run makeClient() at module scope, which meant importing any file
// that touches the database threw immediately when DATABASE_URL was absent.
// `next build` imports every route module to read its config exports — even
// routes marked force-dynamic, since reading the export requires evaluating the
// module — so the whole build failed with "DATABASE_URL is not set" on a
// preview deployment that legitimately has no database attached.
//
// A build should not need a live database. It compiles code; it does not run
// queries. Deferring construction to first property access moves the
// requirement to where it actually exists — the first query, at runtime — and
// keeps the error message intact for that case.
//
// This also means DATABASE_URL can stay scoped to Production only in Vercel,
// which is the fix close-out 2's banner was nagging about: a preview
// deployment then builds fine and simply has no database, rather than sharing
// the production one.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { currentTenantContext } from "@/lib/tenant-context";

// The client Prisma hands an interactive $transaction callback — the model
// delegates plus $executeRaw, without $extends/$connect. Only $executeRaw is
// used here.
type TxClient = { $executeRaw: PrismaClient["$executeRaw"] };

const globalForPrisma = globalThis as unknown as { clients?: Clients };

/**
 * ROW-LEVEL SECURITY, the application half.
 *
 * Every model operation is wrapped in a two-statement transaction: first a
 * set_config() that tells Postgres which tenant this work is for (or that it
 * is a sanctioned system operation), then the query itself. The RLS policies
 * key on those settings. set_config's third argument is `true` — transaction-
 * local — which is what makes this safe through Supabase's transaction-mode
 * pooler: the setting dies with the transaction and can never leak onto
 * whatever connection the pooler hands out next.
 *
 * Context comes from one of two places: an explicit withTenant/asSystem scope
 * (crons, purge, tests), or — on the normal page/action path where none is set
 * — resolveRequestTenant(), which reads it from the request cookie. Only when
 * BOTH are absent does the query run bare, and then the policies see NULL and
 * return nothing: fail closed. (enterWith is deliberately NOT used to push
 * context down; it does not survive a React Server Component render — see
 * request-tenant.ts.)
 *
 * ENFORCEMENT DEPENDS ON THE ROLE. The `postgres` role on Supabase holds
 * BYPASSRLS, so while DATABASE_URL points at it, the policies are dormant and
 * this wrapper is inert bookkeeping. Enforcement begins when DATABASE_URL
 * switches to the `cohort_app` role (no BYPASSRLS) created by
 * scripts/create-app-role.mjs. That two-step is deliberate: ship the wiring,
 * prove it, then turn the key — never both at once.
 *
 * Known limit, accepted: client-level $transaction and $queryRaw are not
 * intercepted. The codebase has no raw queries and no $transaction call sites
 * (retention.ts was refactored off them for exactly this reason), and
 * tests/rls.test.ts fails the build if either reappears.
 */
// One set_config + query, sharing a transaction's connection so the
// transaction-local GUC is visible to the query.
//
// It MUST be an interactive transaction with the operation re-issued on the tx
// client. The array form — $transaction([set_config, query(args)]) — does not
// work: query(args) is the extension's next-hop, not a lazy PrismaPromise, so
// it executes eagerly on a different connection without the GUC and every
// policy denies. Verified: the array form returned zero rows even under bypass;
// this form reads correctly.
async function runWithGuc(
  base: PrismaClient,
  setter: (tx: TxClient) => Promise<unknown>,
  model: string,
  operation: string,
  args: unknown
) {
  return base.$transaction(async (tx) => {
    await setter(tx as unknown as TxClient);
    const delegate = (tx as unknown as Record<string, Record<string, (a: unknown) => unknown>>)[
      model.charAt(0).toLowerCase() + model.slice(1)
    ];
    return delegate[operation](args);
  });
}

/**
 * The context-aware client. Reads the AsyncLocalStorage tenant context on every
 * operation and sets the matching GUC; with no context it runs bare, and the
 * policies deny. This is the client the whole app uses.
 */
function withRls(base: PrismaClient): PrismaClient {
  const extended = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Explicit context first — withTenant / asSystem, used by crons, the
          // retention purge, tests and scripts. When there is none (the normal
          // page and action path), pull the tenant from the request. That pull
          // is dynamically imported so this module has no static dependency on
          // request-tenant.ts, which imports back from here.
          let ctx = currentTenantContext();
          if (!ctx) {
            const { resolveRequestTenant } = await import("@/lib/request-tenant");
            const tenantId = await resolveRequestTenant();
            if (tenantId) ctx = { kind: "tenant", tenantId };
          }
          if (!ctx) return query(args);
          return runWithGuc(
            base,
            (tx) =>
              ctx.kind === "system"
                ? tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`
                : tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`,
            model,
            operation,
            args
          );
        },
      },
    },
  });
  return extended as unknown as PrismaClient;
}

/**
 * The always-bypass client, for the handful of genuinely system operations —
 * resolving a session before a user is known, the pre-auth token and login
 * lookups, the cross-school platform rollup.
 *
 * WHY A SEPARATE CLIENT rather than asSystem(run). Session resolution and the
 * pre-auth token/login lookups happen before any request tenant is known, and
 * they must not themselves be tenant-scoped. Using this client keeps them free
 * of AsyncLocalStorage entirely, so they compose cleanly with everything else.
 *
 * Use it ONLY for operations that are correct to run across every school. Every
 * call site is a place to ask "why may this see everything?".
 */
function bypassClient(base: PrismaClient): PrismaClient {
  const extended = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args }) {
          return runWithGuc(
            base,
            (tx) => tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`,
            model,
            operation,
            args
          );
        },
      },
    },
  });
  return extended as unknown as PrismaClient;
}

type Clients = { app: PrismaClient; system: PrismaClient };

function makeClients(): Clients {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — point it at your Supabase Postgres database.");
  }
  const adapter = new PrismaPg({ connectionString });
  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  return { app: withRls(base), system: bypassClient(base) };
}

let cached: Clients | undefined;

function clients(): Clients {
  // Module-local cache first — this is the hot path, hit on every property
  // access, and it must never reach makeClients() twice.
  if (cached) return cached;
  // Dev hot reload re-evaluates the module but keeps globalThis, so reuse the
  // existing clients rather than opening another pool on every edit. Both share
  // one base connection pool.
  if (globalForPrisma.clients) return (cached = globalForPrisma.clients);
  cached = makeClients();
  if (process.env.NODE_ENV !== "production") globalForPrisma.clients = cached;
  return cached;
}

/** A lazy Proxy over one of the two clients, so ~200 call sites read the same
 *  `prisma.user.findMany(...)` and construction is still deferred to first use
 *  (a build must not need a live database). */
function facade(pick: (c: Clients) => PrismaClient): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_t, prop) {
      const c = pick(clients());
      const value = Reflect.get(c as object, prop, c);
      return typeof value === "function" ? value.bind(c) : value;
    },
    has(_t, prop) {
      return prop in (pick(clients()) as object);
    },
  });
}

/** The context-aware client. Almost everything uses this. */
export const prisma = facade((c) => c.app);

/**
 * The always-bypass client. Use ONLY for genuinely cross-school operations —
 * session resolution, pre-auth token/login lookups, the platform rollup. Every
 * use is a place to justify why it may see every school. See bypassClient.
 */
export const prismaSystem = facade((c) => c.system);
