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

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — point it at your Supabase Postgres database.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

let cached: PrismaClient | undefined;

function realClient(): PrismaClient {
  // Module-local cache first — this is the hot path, hit on every property
  // access, and it must never reach makeClient() twice.
  if (cached) return cached;
  // Dev hot reload re-evaluates the module but keeps globalThis, so reuse the
  // existing client rather than opening another pool on every edit.
  if (globalForPrisma.prisma) return (cached = globalForPrisma.prisma);
  cached = makeClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = cached;
  return cached;
}

/**
 * The client, but only really built on first use.
 *
 * A Proxy rather than a `getPrisma()` function so the ~200 existing call sites
 * keep working unchanged — `prisma.user.findMany(...)` still reads the same.
 * Methods are bound to the underlying client because Prisma's own delegates
 * rely on their `this`.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = realClient();
    const value = Reflect.get(c as object, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
  has(_target, prop) {
    return prop in (realClient() as object);
  },
});
