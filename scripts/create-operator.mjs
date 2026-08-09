#!/usr/bin/env node
// Create a PLATFORM OPERATOR account — role "admin", no school, platformAdmin
// true. This is the only kind of account that opens /cohort-admin on the
// apex, and this script (or SQL by hand) is the only way one comes to exist:
// no UI can create or escalate one.
//
//   node scripts/create-operator.mjs brandon@schoolcohort.com 'a strong password'
//
// The password is hashed here (scrypt, same as the app) and never stored or
// printed in the clear. Mind your shell history when passing it as an
// argument. Refuses to overwrite an existing operator with that email.

import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];
if (!email || !password) {
  console.error("usage: node scripts/create-operator.mjs <email> <password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("password must be at least 8 characters");
  process.exit(1);
}

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const direct = env.match(/^DIRECT_URL="?([^"\n]+?)"?$/m)?.[1];
if (!direct) {
  console.error("DIRECT_URL not found in .env");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
const id = "op_" + crypto.randomBytes(12).toString("hex");

const client = new pg.Client({ connectionString: direct });
await client.connect();
try {
  const existing = await client.query(
    `SELECT id FROM "User" WHERE lower(email) = $1 AND "schoolId" IS NULL`,
    [email]
  );
  if (existing.rows.length > 0) {
    console.error(`an operator with ${email} already exists — nothing changed`);
    process.exit(1);
  }
  await client.query(
    `INSERT INTO "User" (id, "schoolId", role, name, email, password, "platformAdmin", "emailAlerts")
     VALUES ($1, NULL, 'admin', $2, $3, $4, true, false)`,
    [id, email.split("@")[0], email, hash]
  );
  console.log(`operator created: ${email}`);
  console.log(`sign in at <root domain>/cohort-admin`);
} finally {
  await client.end();
}
