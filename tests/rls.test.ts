// Row-level security: the guards on the guard.
//
// The policies are SQL in a migration and the wiring is three lines in a
// dozen files — exactly the shape of thing that decays silently. These tests
// hold the three load-bearing facts:
//
//   1. Every model has a policy. A new model without one ships deny-all for
//      the app role, which is fail-closed but also a broken feature; the
//      failure should happen HERE, at build time, with instructions.
//   2. The client wiring exists and fails closed.
//   3. The patterns the extension cannot survive (client-level $transaction,
//      raw SQL) stay out of the codebase.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { withTenant, asSystem, currentTenantContext } from "@/lib/tenant-context";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// Comments stripped for the pattern scans — retention.ts documents WHY it
// avoids $transaction, and prose must not trip a guard about code.
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const MIGRATION = "prisma/migrations/20260807230000_rls_policies/migration.sql";

function models(): { name: string; hasSchoolId: boolean }[] {
  const schema = read("prisma/schema.prisma");
  return [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({
    name: m[1],
    hasSchoolId: /^\s+schoolId\s/m.test(m[2]),
  }));
}

describe("every model has a policy", () => {
  const sql = read(MIGRATION);

  it.each(models().map((m) => [m.name, m] as const))("%s", (_n, m) => {
    // A model added after this migration needs its own policy migration.
    // This failure is the reminder: copy the pattern from
    // 20260807230000_rls_policies for the new table, in a NEW migration.
    expect(sql, `no CREATE POLICY for "${m.name}" — add a policy migration`).toContain(
      `CREATE POLICY rls_tenant ON "${m.name}"`
    );
    if (m.hasSchoolId && !["User"].includes(m.name)) {
      const block = sql.slice(sql.indexOf(`CREATE POLICY rls_tenant ON "${m.name}"`));
      const policy = block.slice(0, block.indexOf(";"));
      expect(policy, `${m.name} policy must key on its own schoolId or a sanctioned join`).toMatch(
        /schoolId|EXISTS/
      );
    }
  });

  it("finds a realistic number of models — the parser must not silently match nothing", () => {
    expect(models().length).toBeGreaterThan(30);
  });

  it("fails closed: no policy grants access without a tenant or the bypass", () => {
    // Every USING clause must reference one of the two GUCs. A policy with a
    // bare `true` would be an open door.
    const sql = read(MIGRATION);
    for (const m of sql.matchAll(/USING \(([\s\S]*?)\)\s*\n\s*WITH CHECK/g)) {
      expect(m[1]).toMatch(/app\.tenant_id|app\.bypass_rls/);
    }
  });
});

describe("the client wiring", () => {
  const db = read("src/lib/db.ts");

  it("sets the GUC inside a transaction, transaction-locally", () => {
    expect(db).toContain("set_config('app.tenant_id'");
    expect(db).toContain("set_config('app.bypass_rls'");
    // The third argument must be true — a session-scoped setting would leak
    // across pooled connections.
    expect(db).toMatch(/set_config\('app\.tenant_id', \$\{[^}]+\}, true\)/);
  });

  it("runs bare — and therefore denied — when there is no context", () => {
    expect(db).toMatch(/if \(!ctx\) return query\(args\)/);
  });

  it("getSession binds the tenant for the rest of the request", () => {
    const auth = read("src/lib/auth.ts");
    expect(auth).toContain("asSystem(() => resolveSession(sid))");
    expect(auth).toContain("enterTenant(resolved.user.schoolId)");
  });

  it("the one cross-school read is the aggregate rollup, marked system", () => {
    const observe = read("src/lib/observe.ts");
    const platformBlock = observe.slice(
      observe.indexOf("const [platform, school]"),
      observe.indexOf('by: ["railId", "programCode", "outcome"]', observe.indexOf("asSystem"))
    );
    expect(platformBlock).toContain("asSystem");
  });

  it("the purge runs each school AS that school", () => {
    expect(read("src/lib/retention.ts")).toMatch(/withTenant\(s\.id, \(\) => purgeSchool\(s\)\)/);
  });
});

describe("patterns the extension cannot survive stay out", () => {
  function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (name === "generated" || name === "node_modules") continue;
      const rel = join(dir, name);
      if (statSync(join(ROOT, rel)).isDirectory()) sources(rel, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
    }
    return out;
  }

  it("no client-level $transaction outside db.ts", () => {
    // The RLS wrapper opens its own transaction per operation; a client-level
    // batch does not compose with it. retention.ts was refactored off them.
    const offenders = sources("src").filter(
      (f) => f !== join("src", "lib", "db.ts") && code(read(f)).includes("$transaction")
    );
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("no raw SQL outside db.ts", () => {
    // $queryRaw/$executeRaw bypass the model-operation hook entirely.
    const offenders = sources("src").filter(
      (f) => f !== join("src", "lib", "db.ts") && /\$(queryRaw|executeRaw)/.test(code(read(f)))
    );
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});

describe("tenant-context semantics", () => {
  it("scopes and restores", async () => {
    expect(currentTenantContext()).toBeUndefined();
    await withTenant("school-a", async () => {
      expect(currentTenantContext()).toEqual({ kind: "tenant", tenantId: "school-a" });
      await asSystem(async () => {
        expect(currentTenantContext()).toEqual({ kind: "system" });
      });
      // Restored after the nested system block.
      expect(currentTenantContext()).toEqual({ kind: "tenant", tenantId: "school-a" });
    });
    expect(currentTenantContext()).toBeUndefined();
  });

  it("survives awaits inside the scope", async () => {
    await withTenant("school-b", async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(currentTenantContext()).toEqual({ kind: "tenant", tenantId: "school-b" });
    });
  });

  it("parallel scopes do not bleed into each other", async () => {
    // Two tenants interleaving on the event loop — the exact shape of two
    // concurrent requests — must each see only their own id.
    const seen: string[] = [];
    await Promise.all([
      withTenant("one", async () => {
        await new Promise((r) => setTimeout(r, 10));
        const ctx = currentTenantContext();
        seen.push(ctx?.kind === "tenant" ? ctx.tenantId : "WRONG");
      }),
      withTenant("two", async () => {
        await new Promise((r) => setTimeout(r, 5));
        const ctx = currentTenantContext();
        seen.push(ctx?.kind === "tenant" ? ctx.tenantId : "WRONG");
      }),
    ]);
    expect(seen.sort()).toEqual(["one", "two"]);
  });
});
