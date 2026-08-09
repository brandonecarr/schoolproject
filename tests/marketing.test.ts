// The marketing beacon's privacy boundary, held as source invariants.
//
// The promise on the admin page — "no cookies read, no IPs stored" — is only
// true while this file stays true. The allowlist is the line between "public
// marketing surface" and "a school's app", and the app side must never be
// countable, even by a crafted POST.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const beacon = read("src/app/api/beacon/route.ts");
const proxy = read("src/proxy.ts");
const trackView = read("src/components/TrackView.tsx");

// The exact allowlist, evaluated the way the route evaluates it.
const ALLOWED = (path: string): boolean =>
  path === "/" ||
  path === "/book" ||
  path === "/find" ||
  path === "/states" ||
  /^\/states\/[a-z-]{2,40}$/.test(path);

describe("the beacon counts only public marketing pages", () => {
  it("public surfaces pass", () => {
    for (const p of ["/", "/book", "/find", "/states", "/states/arizona", "/states/new-hampshire"]) {
      expect(ALLOWED(p), p).toBe(true);
    }
  });

  it("app and child surfaces can never enter the table", () => {
    for (const p of [
      "/dashboard",
      "/student",
      "/student/work",
      "/parent/children",
      "/gradebook",
      "/cohort-admin",
      "/signup",
      "/states/arizona/extra",
      "/states/UPPER",
      "/states/x", // too short to be a slug
      "/statesfoo",
      "",
    ]) {
      expect(ALLOWED(p), p).toBe(false);
    }
  });

  it("the source's allowlist is the one tested above", () => {
    expect(beacon).toContain('path === "/" ||');
    expect(beacon).toContain('path === "/book"');
    expect(beacon).toContain('path === "/find"');
    expect(beacon).toContain("/^\\/states\\/[a-z-]{2,40}$/");
  });
});

describe("what the beacon stores — and refuses to", () => {
  it("writes only day, path, referrerHost, count", () => {
    expect(beacon).toMatch(/create: \{ day, path, referrerHost, count: 1 \}/);
  });

  it("never touches IP, user agent, or cookies", () => {
    expect(beacon).not.toMatch(/x-forwarded-for|request\.ip|user-agent|userAgent/i);
    expect(beacon).not.toContain("cookies");
  });

  it("referrers from our own host and subdomains are discarded", () => {
    expect(beacon).toContain("host !== own");
    expect(beacon).toContain("endsWith(`.${own}`)");
  });

  it("the client component fires once, fire-and-forget", () => {
    expect(trackView).toContain("sendBeacon");
    expect(trackView).toContain('"use client"');
  });
});

describe("campaign attribution", () => {
  it("the proxy sets coh_ref only on apex pages, first touch, slug-clamped", () => {
    const apexBlock = proxy.slice(proxy.indexOf('kind.kind === "apex"'));
    expect(apexBlock).toContain('cookies.set("coh_ref"');
    expect(apexBlock).toContain('!request.cookies.get("coh_ref")');
    expect(apexBlock).toContain("replace(/[^a-zA-Z0-9_-]/g");
    expect(apexBlock).toContain(".slice(0, 60)");
  });

  it("the cookie is http-only and expires", () => {
    expect(proxy).toContain("httpOnly: true");
    expect(proxy).toContain("maxAge: 30 * 24 * 60 * 60");
  });
});
