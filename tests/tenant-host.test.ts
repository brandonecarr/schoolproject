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

/** Source with comments removed, for assertions that must not be satisfied —
 *  or tripped — by prose. This file's own header explains why several of these
 *  comments deliberately quote the pattern they forbid. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

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

  it("the apex voids every session except a platform admin's", () => {
    // The operator console lives on the apex; its flag is the ONE exception
    // to "no sessions here". Checked on signedIn — the real human — so an
    // impersonated view can never widen into an apex session.
    expect(auth).toMatch(/kind\.kind === "apex" && !signedIn\.platformAdmin\) return null/);
  });
});

describe("the session cookie stays host-only", () => {
  // The browser is what actually keeps cedar-grove's cookie away from
  // oak-hill: a cookie set without a Domain attribute is sent to that exact
  // host and nowhere else. Adding `domain:` to widen it — usually to "fix"
  // something on the apex — would silently share one jar across every school.
  const setters = [
    "src/lib/auth.ts", // where the options now live
    "src/app/login/actions.ts",
    "src/app/signup/actions.ts",
    "src/app/enter/route.ts",
    "src/app/invite/actions.ts",
    "src/app/reset/actions.ts",
  ];

  it.each(setters)("%s sets no cookie domain", (path) => {
    // Comments stripped first. The options block is documented with the exact
    // wrong line — `domain: ".schoolcohort.com"` — so that the next person
    // reading it knows what not to add, and a naive grep flags that prose as
    // the very thing it is warning against.
    expect(code(read(path))).not.toMatch(/domain\s*:/i);
  });

  it("finds the cookie writes it claims to be checking", () => {
    const hits = setters.filter((p) => read(p).includes("SESSION_COOKIE"));
    expect(hits.length).toBeGreaterThanOrEqual(5);
  });

  it("is set once, so the four routes cannot drift apart", () => {
    // Four routes create sessions. When each spelled the options out inline,
    // "add secure" was a four-file change and three-quarters of a fix was a
    // plausible outcome.
    const auth = read("src/lib/auth.ts");
    expect(auth).toContain("SESSION_COOKIE_OPTIONS");
    expect(auth).toMatch(/secure: process\.env\.NODE_ENV === "production"/);
    expect(auth).toContain("httpOnly: true");
    for (const p of setters.slice(1)) {
      if (!read(p).includes("SESSION_COOKIE_OPTIONS")) continue;
      expect(read(p), p).not.toMatch(/httpOnly:/);
    }
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
    // brand-new owner off their subdomain and onto the apex. Measured, not
    // assumed: the dev server returned http://localhost:3000 for a request
    // whose Host was the subdomain.
    expect(enter).not.toMatch(/new URL\([^)]*,\s*request\.url\s*\)/);
    expect(enter).toContain("currentOrigin()");
  });

  it("expires in minutes", () => {
    const src = read("src/app/signup/actions.ts");
    expect(src).toMatch(/tokenExpiryMinutes\([1-9]\)/);
  });
});

// A link that leaves the app has to point at the SCHOOL's address. With
// host-only cookies, a link to the wrong origin is a link to a sign-in page.
describe("links that leave the app carry the school's own address", () => {
  const surfaces = [
    "src/app/(teacher)/invites/page.tsx", // invite + reset links a teacher shares
    "src/app/(teacher)/calendar/page.tsx", // iCal subscription URL
    "src/app/(portal)/parent/calendar/page.tsx",
    "src/app/(portal)/student/calendar/page.tsx",
  ];

  it.each(surfaces)("%s builds its URLs from currentOrigin", (path) => {
    expect(read(path)).toContain("currentOrigin");
  });

  it.each(surfaces)("%s does not reassemble a host by hand", (path) => {
    // The version of this that shipped for months read the Host header inline
    // in one file and used a bare relative path in three others — so the iCal
    // URL a parent was told to paste into Apple Calendar was "/calendar/x.ics".
    expect(read(path)).not.toMatch(/x-forwarded-proto/);
  });

  it("email links resolve the school rather than the deployment", () => {
    const notify = read("src/lib/notify.ts");
    expect(notify).toContain("originFor(school.slug)");
    // Untenanted still needs an answer, and appUrl is it.
    expect(notify).toContain("appUrl()");
  });
});

describe("choosing the school's address at signup", () => {
  const actions = read("src/app/signup/actions.ts");

  it("re-derives whatever the form sent instead of trusting it", () => {
    // The field is a client component and this value becomes a hostname.
    expect(actions).toMatch(/slugify\(String\(formData\.get\("slug"\)/);
    expect(actions).toContain("isUsableSlug(asked)");
  });

  it("refuses a taken address rather than renumbering it", () => {
    // availableSlug would hand back oak-hill-2. That is right when we derived
    // the name ourselves and wrong when a person typed it — they would land on
    // an address they did not choose and never notice.
    expect(actions).toMatch(/!taken\.includes\(asked\) \? asked : null/);
    // The redirect keeps the chosen account kind in the URL (err() builds it),
    // so the assertion is on the error code, not a bare path.
    expect(actions).toContain('redirect(err("slug"))');
  });

  it("still works with no JavaScript, by deriving from the school name", () => {
    expect(actions).toContain("availableSlug(schoolName, taken)");
  });

  it("tells the new owner their address once they are inside", () => {
    // It cannot be changed later and every family reaches the school through
    // it, so it is not something to leave in the URL bar and hope.
    expect(read("src/app/enter/route.ts")).toContain("/dashboard?welcome=1");
    expect(read("src/app/(teacher)/dashboard/page.tsx")).toContain("currentOrigin");
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

  it("routes nothing at all when tenancy is switched off", () => {
    // The untenanted branch returns before any redirect logic — a laptop and a
    // preview deployment must behave exactly as the single-school app did.
    expect(proxy).toMatch(/if \(!root\) return noindex\(\)/);
    expect(proxy.indexOf("if (!root)")).toBeLessThan(proxy.indexOf("NextResponse.redirect"));
  });

  it("keeps a school's own address out of search results", () => {
    // A crawler can only reach a sign-in page, but that page carries the
    // school's NAME — and a directory of "schools using Cohort" assembled out
    // of our subdomains is a customer list published by accident.
    expect(proxy).toContain('res.headers.set("x-robots-tag", "noindex, nofollow")');
    // The apex is the one host that wants to be found, so it must NOT get it.
    const apexBranch = proxy.slice(proxy.indexOf('kind.kind === "apex"'));
    expect(apexBranch).toContain("NextResponse.next()");
  });
});
