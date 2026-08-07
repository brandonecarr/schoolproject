// Which address is this, and does the app treat it correctly?
//
// classifyHost is the routing half of tenancy. slugFromHost (tests/tenant.test.ts)
// already answers "which school"; this answers "and if not a school, then what",
// which is the question that decides whether a preview deployment still works
// and whether the teacher console is reachable on the marketing domain.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyHost } from "@/lib/tenant";

const ROOT = "cohort.school";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("classifyHost", () => {
  it("names the school on its own subdomain", () => {
    expect(classifyHost("cedar-grove.cohort.school", ROOT)).toEqual({
      kind: "tenant",
      slug: "cedar-grove",
    });
    expect(classifyHost("CEDAR-GROVE.COHORT.SCHOOL:443", ROOT)).toEqual({
      kind: "tenant",
      slug: "cedar-grove",
    });
  });

  it("calls the apex the apex, with or without www", () => {
    expect(classifyHost("cohort.school", ROOT)).toEqual({ kind: "apex" });
    expect(classifyHost("www.cohort.school", ROOT)).toEqual({ kind: "apex" });
  });

  it("refuses a hostname under our domain that is not a school", () => {
    // These are the ones that must not be mistaken for the apex: mail.<root>
    // reaching the marketing site is harmless, but the classifier deciding it
    // is a tenant would be a school nobody owns.
    for (const h of ["mail.cohort.school", "a.b.cohort.school", "-bad.cohort.school"]) {
      expect(classifyHost(h, ROOT), h).toEqual({ kind: "invalid" });
    }
  });

  it("treats anything not under the root domain as untenanted, not as ours", () => {
    // A preview deployment and a laptop have to keep working, and a lookalike
    // domain must not be handed the apex either.
    for (const h of [
      "localhost:3000",
      "cohort-git-branch-acme.vercel.app",
      "127.0.0.1:3000",
      "cedar-grove.evil.com",
      "xcohort.school",
      "cohort.school.evil.com",
    ]) {
      expect(classifyHost(h, ROOT), h).toEqual({ kind: "unknown" });
    }
  });

  it("is untenanted when ROOT_DOMAIN is not configured", () => {
    // The default state of a fresh checkout. Everything must behave as the
    // single-school app did before tenancy existed.
    for (const h of ["cohort.school", "cedar-grove.cohort.school", "localhost:3000"]) {
      expect(classifyHost(h, ""), h).toEqual({ kind: "unknown" });
      expect(classifyHost(h, null), h).toEqual({ kind: "unknown" });
    }
  });

  it("survives a missing Host header", () => {
    expect(classifyHost(null, ROOT)).toEqual({ kind: "unknown" });
    expect(classifyHost("", ROOT)).toEqual({ kind: "unknown" });
  });
});

// The gate itself is three lines inside a much longer function, and its whole
// job is to be there. Nothing else in the suite would notice its removal: every
// other test runs untenanted, where the gate is a no-op by design. So read the
// source.
describe("the tenant gate is wired into the session, not just written down", () => {
  const auth = read("src/lib/auth.ts");

  it("getSession consults the address the request arrived on", () => {
    expect(auth).toContain("currentHostKind");
  });

  it("a session whose school does not match the subdomain is refused", () => {
    expect(auth).toMatch(/kind\.kind === "tenant" && school\?\.slug !== kind\.slug\) return null/);
  });

  it("the apex carries no signed-in session", () => {
    expect(auth).toMatch(/kind\.kind === "apex"\) return null/);
  });
});

describe("the session cookie stays host-only", () => {
  // The browser is what actually keeps cedar-grove's cookie away from
  // oak-hill: a cookie set without a Domain attribute is sent to that exact
  // host and nowhere else. Adding `domain:` to widen it — usually to "fix"
  // something on the apex — would silently share one jar across every school.
  const setters = [
    "src/app/login/actions.ts",
    "src/app/signup/actions.ts",
    "src/app/enter/route.ts",
    "src/app/invite/actions.ts",
    "src/app/reset/actions.ts",
  ];

  it.each(setters)("%s sets no cookie domain", (path) => {
    const src = read(path);
    expect(src).not.toMatch(/domain\s*:/i);
  });

  it("finds the cookie writes it claims to be checking", () => {
    const hits = setters.filter((p) => read(p).includes("SESSION_COOKIE"));
    expect(hits.length).toBeGreaterThanOrEqual(4);
  });
});

describe("the signup handoff", () => {
  const enter = read("src/app/enter/route.ts");

  it("is single-use, and burns the token before creating the session", () => {
    // updateMany with `usedAt: null` in the WHERE is the atomic part: two tabs
    // racing on the same link both reach it, and exactly one gets count === 1.
    expect(enter).toMatch(/updateMany\(\{[\s\S]*usedAt: null[\s\S]*\}\)/);
    expect(enter).toContain("burned.count !== 1");
    expect(enter.indexOf("updateMany")).toBeLessThan(enter.indexOf("session.create"));
  });

  it("refuses to redeem on any host but the school's own", () => {
    expect(enter).toContain("currentHostKind");
    expect(enter).toMatch(/kind\.kind !== "tenant" \|\| school\?\.slug !== kind\.slug/);
  });

  it("builds its redirects from the Host, not request.url", () => {
    // request.url reports the server's own origin in dev, which would bounce a
    // brand-new owner off their subdomain and onto the apex.
    expect(enter).not.toMatch(/new URL\([^)]*,\s*request\.url\s*\)/);
    expect(enter).toContain('request.headers.get("host")');
  });

  it("expires in minutes", () => {
    const src = read("src/app/signup/actions.ts");
    expect(src).toMatch(/tokenExpiryMinutes\([1-9]\)/);
  });
});

describe("the apex serves only the public surface", () => {
  const proxy = read("src/proxy.ts");

  it("allows paths by list rather than blocking app routes one by one", () => {
    // A blocklist stops covering the route added next phase, which is the one
    // most likely to be wrong.
    expect(proxy).toContain("APEX_PATHS");
    for (const p of ["/signup", "/api", "/invite", "/reset"]) {
      expect(proxy, p).toContain(`"${p}"`);
    }
  });

  it("does not list a single teacher or family route", () => {
    for (const p of ["/dashboard", "/students", "/invoices", "/parent", "/student", "/gradebook"]) {
      expect(proxy, p).not.toContain(`"${p}"`);
    }
  });

  it("does nothing at all when tenancy is switched off", () => {
    expect(proxy).toMatch(/if \(!root\) return NextResponse\.next\(\)/);
  });
});
