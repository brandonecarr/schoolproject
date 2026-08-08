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
  walk(join(process.cwd(), "src/app/admin"));
  return out;
}

describe("every admin surface is gated", () => {
  it("each page and the actions file call requirePlatformAdmin", () => {
    for (const p of adminSourceFiles()) {
      const src = readFileSync(p, "utf8");
      const isPage = p.endsWith("page.tsx");
      const isActions = p.endsWith("actions.ts");
      if (isPage || isActions) {
        expect(src, p).toContain("requirePlatformAdmin");
      }
    }
  });

  it("every server action starts with the gate", () => {
    const actions = read("src/app/admin/actions.ts");
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
          if (/platformAdmin\s*:/.test(src) && !p.includes("generated")) offenders.push(p);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});

describe("what the console shows", () => {
  it("the overview renders no child data — schools and counts only", () => {
    const page = read("src/app/admin/page.tsx");
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
