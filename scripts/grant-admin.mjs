#!/usr/bin/env node
// Grant (or revoke) the platform-admin flag — the only way it is ever set.
//
// No UI and no server action can flip User.platformAdmin, by design: the set
// of platform operators is exactly the set of people someone with database
// access chose. Run against the database in DIRECT_URL (owner work, like
// migrations).
//
//   node scripts/grant-admin.mjs you@example.com           # grant
//   node scripts/grant-admin.mjs you@example.com --revoke  # revoke
//
// The email may exist at several schools (per-school uniqueness); every match
// is updated and each is listed so you can see exactly what you granted.

import { readFileSync } from "node:fs";
import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
const revoke = process.argv.includes("--revoke");
if (!email) {
  console.error("usage: node scripts/grant-admin.mjs <email> [--revoke]");
  process.exit(1);
}

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const direct = env.match(/^DIRECT_URL="?([^"\n]+?)"?$/m)?.[1];
if (!direct) {
  console.error("DIRECT_URL not found in .env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: direct });
await client.connect();
const { rows } = await client.query(
  `UPDATE "User" SET "platformAdmin" = $1 WHERE lower(email) = $2
   RETURNING id, name, role, "schoolId"`,
  [!revoke, email]
);
await client.end();

if (rows.length === 0) {
  console.error(`no user with email ${email}`);
  process.exit(1);
}
for (const r of rows) {
  console.log(`${revoke ? "revoked" : "granted"}: ${r.name} (${r.role}) school=${r.schoolId}`);
}
