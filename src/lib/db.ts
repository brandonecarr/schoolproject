// Prisma client singleton.
//
// Prisma 7 connects through a driver adapter. We use libsql (@libsql/client):
//  - locally it opens the SQLite file at DATABASE_URL (file:./dev.db)
//  - it ships prebuilt binaries, so no native-compile failures like better-sqlite3
//  - the same adapter points at Turso for serverless/Vercel with only an env change
//
// Next.js dev mode hot-reloads modules, so cache the client on globalThis to
// avoid exhausting connections. Replaces the Express MVP's JSON store (src/db.js).

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient(): PrismaClient {
  // Local dev: DATABASE_URL is a file: URL and no token is needed.
  // Production (Vercel): point DATABASE_URL at a Turso database (libsql://…) and
  // set DATABASE_AUTH_TOKEN — the same adapter works, no code change.
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  const adapter = new PrismaLibSql(authToken ? { url, authToken } : { url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
