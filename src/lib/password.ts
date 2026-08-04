// Pure crypto helpers — no Next.js or "server-only" imports, so this module is
// safe to use from standalone scripts (the seed) as well as server code.
// scrypt via node:crypto keeps password hashing dependency-free (no bcrypt).

import crypto from "node:crypto";

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(":")) return false;
  const [salt, key] = stored.split(":");
  const test = crypto.scryptSync(pw, salt, 64);
  const known = Buffer.from(key, "hex");
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

export function newSessionId(): string {
  return crypto.randomBytes(24).toString("hex");
}
