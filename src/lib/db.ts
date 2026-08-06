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

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
