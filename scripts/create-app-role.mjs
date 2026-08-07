#!/usr/bin/env node
// Create (or refresh) the `cohort_app` database role — the role that makes the
// RLS policies real.
//
// WHY A SECOND ROLE EXISTS AT ALL: Supabase's `postgres` role carries
// BYPASSRLS, so no policy can ever bind it. `cohort_app` has no such
// attribute; the moment DATABASE_URL points at it, every policy in
// prisma/migrations/*_rls_policies is live. Migrations and seeds keep using
// `postgres` via DIRECT_URL — DDL and seeding are owner work.
//
// SECRET HANDLING: the password is generated here, sent only to the database,
// and written only into .env (gitignored). It is never printed. To put it in
// Vercel, copy the DATABASE_URL line out of .env yourself — that file is on
// your machine; this transcript is not the place for it.
//
// Idempotent: re-running rotates the password and refreshes grants.

import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";

const env = readFileSync(".env", "utf8");
const direct = env.match(/^DIRECT_URL="([^"]+)"/m)?.[1];
if (!direct) throw new Error("DIRECT_URL not found in .env");

const password = randomBytes(24).toString("hex");
const client = new pg.Client({ connectionString: direct });
await client.connect();

try {
  const { rows } = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'cohort_app'"
  );
  if (rows.length === 0) {
    // NOBYPASSRLS is the entire point. NOCREATEDB/NOCREATEROLE because the app
    // needs neither, and a narrow role stays narrow.
    await client.query(
      `CREATE ROLE cohort_app LOGIN NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`
    );
    console.log("created role cohort_app");
  } else {
    await client.query(`ALTER ROLE cohort_app WITH LOGIN NOBYPASSRLS PASSWORD '${password}'`);
    console.log("rotated cohort_app password");
  }

  await client.query(`GRANT USAGE ON SCHEMA public TO cohort_app`);
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cohort_app`
  );
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cohort_app`);
  // Tables created by FUTURE migrations (which run as postgres) must be
  // reachable without re-running this script.
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cohort_app`
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cohort_app`
  );
  console.log("grants refreshed");
} finally {
  await client.end();
}

// Rewrite .env: DATABASE_URL becomes the cohort_app pooler connection; the
// old owner URL is preserved under DATABASE_URL_OWNER for anyone who needs to
// run something with the old powers deliberately.
const current = env.match(/^DATABASE_URL="([^"]+)"/m)?.[1];
if (!current) throw new Error("DATABASE_URL not found in .env");
const url = new URL(current);
const ref = url.username.split(".")[1]; // postgres.<ref> or cohort_app.<ref>
url.username = ref ? `cohort_app.${ref}` : "cohort_app";
url.password = password;

let next = env;
if (!/^DATABASE_URL_OWNER=/m.test(next) && url.username !== new URL(current).username) {
  next = next.replace(/^DATABASE_URL="/m, `DATABASE_URL_OWNER="${current}"\nDATABASE_URL="`);
}
next = next.replace(/^DATABASE_URL="[^"]+"/m, `DATABASE_URL="${url.toString()}"`);
writeFileSync(".env", next);
console.log("DATABASE_URL now uses cohort_app (owner URL kept as DATABASE_URL_OWNER)");
console.log("→ For production: copy the new DATABASE_URL value from .env into Vercel.");
