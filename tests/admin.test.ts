// The admin console: the one surface allowed to read across schools, which
// makes its gate the most load-bearing line in it. These tests hold the
// properties that keep it an operator console and not an escalation path.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function adminSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
    }
  };
  walk(join(process.cwd(), "src/app/cohort-admin"));
  return out;
}

describe("every admin surface is gated", () => {
  it("each page and the actions file call requirePlatformAdmin", () => {
    for (const p of adminSourceFiles()) {
      // The one exemption: login/ IS the gate's door. Its action scopes the
      // candidate lookup to platformAdmin accounts instead, held below.
      if (p.includes("/login/")) continue;
      const src = readFileSync(p, "utf8");
      const isPage = p.endsWith("page.tsx");
      const isActions = p.endsWith("actions.ts");
      if (isPage || isActions) {
        expect(src, p).toContain("requirePlatformAdmin");
      }
    }
  });

  it("the login door only ever considers platformAdmin accounts", () => {
    const login = read("src/app/cohort-admin/login/actions.ts");
    expect(login).toMatch(/where: \{ email, platformAdmin: true \}/);
    expect(login).toContain("verifyPassword");
    // Uniform failure: one redirect target for every bad outcome.
    expect(login).toContain('redirect("/cohort-admin/login?error=1")');
  });

  it("an unauthenticated visitor lands on the console's own door", () => {
    const auth = read("src/lib/auth.ts");
    const gate = auth.slice(auth.indexOf("export async function requirePlatformAdmin"));
    expect(gate).toContain('redirect("/cohort-admin/login")');
  });

  it("the apex serves the console", () => {
    expect(read("src/proxy.ts")).toContain('"/cohort-admin"');
  });

  it("every server action starts with the gate", () => {
    const actions = read("src/app/cohort-admin/actions.ts");
    const fns = actions.split(/export async function /).slice(1);
    for (const fn of fns) {
      const name = fn.slice(0, fn.indexOf("("));
      expect(fn.slice(0, 200), name).toContain("await requirePlatformAdmin()");
    }
  });
});

describe("the gate itself", () => {
  const auth = read("src/lib/auth.ts");

  it("refuses impersonation and non-admins", () => {
    const gate = auth.slice(auth.indexOf("export async function requirePlatformAdmin"));
    expect(gate).toContain("session.actor");
    expect(gate).toContain("platformAdmin");
  });

  it("no UI or action can set the flag — only the grant script mentions it as a write", () => {
    // Any prisma .update/.create writing platformAdmin outside the script
    // would be an escalation path.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts") || p.endsWith(".tsx")) {
          const src = readFileSync(p, "utf8");
          // A WRITE is `platformAdmin:` inside a prisma `data:` block. Reading
          // the flag (gates, the login door's where-filter) is fine.
          // No dotAll flag needed: [^}] matches newlines on its own, and the
          // build's TS target predates /s.
          if (/data:\s*\{[^}]*platformAdmin/.test(src) && !p.includes("generated")) offenders.push(p);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});

describe("what the console shows", () => {
  it("the overview renders no child data — schools and counts only", () => {
    const page = read("src/app/cohort-admin/page.tsx");
    expect(page).not.toContain("prismaSystem.submission");
    expect(page).not.toContain("prismaSystem.fileRec");
    expect(page).not.toMatch(/student\.findMany/);
  });

  it("Lead carries an RLS policy like every other table", () => {
    const mig = read("prisma/migrations/20260808120000_admin_and_leads/migration.sql");
    expect(mig).toContain('ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY');
    expect(mig).toContain('CREATE POLICY rls_tenant ON "Lead"');
  });
});

describe("operator accounts stay out of the school app", () => {
  const auth = readFileSync(join(process.cwd(), "src/lib/auth.ts"), "utf8");

  it("requireUser refuses a schoolless session into school surfaces", () => {
    const gate = auth.slice(auth.indexOf("export async function requireUser"));
    expect(gate.slice(0, 400)).toContain("!session.user.schoolId");
  });

  it("requireRole re-checks it — the narrowing is runtime-true, not a cast alone", () => {
    const gate = auth.slice(auth.indexOf("export async function requireRole"));
    expect(gate.slice(0, 400)).toContain("!session.user.schoolId");
  });

  it("operator emails are unique among themselves at the database", () => {
    const mig = readFileSync(
      join(process.cwd(), "prisma/migrations/20260809030000_operator_accounts/migration.sql"),
      "utf8"
    );
    expect(mig).toContain('WHERE "schoolId" IS NULL');
    expect(mig).toContain("UNIQUE INDEX");
  });
});
