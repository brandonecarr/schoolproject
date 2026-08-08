// The school finder: the one place on the apex that answers "which school?" —
// and it must only ever answer BY EMAIL. These tests hold the properties that
// keep it from becoming a public directory of customer schools.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const action = read("src/app/find/actions.ts");
const page = read("src/app/find/page.tsx");

describe("the finder answers by email, never on screen", () => {
  it("the page runs no queries at all", () => {
    // A page that touched the database would have something it could leak.
    expect(page).not.toContain("prisma");
    expect(page).not.toContain("findMany");
  });

  it("the action's response is identical whether or not the email matched", () => {
    // Exactly one redirect target, outside every conditional: no oracle for
    // "does this email exist" or "did that match a school".
    const redirects = action.match(/redirect\(/g) ?? [];
    expect(redirects.length).toBe(1);
    expect(action).toContain('redirect("/find?sent=1")');
    // The single redirect is the function's last statement, after the guarded
    // block — matched and unmatched paths converge on it.
    expect(action.trim().split("\n").at(-2)).toContain('redirect("/find?sent=1")');
  });

  it("the cross-school lookup carries its justification at the call site", () => {
    expect(action).toContain("prismaSystem");
    expect(action).toMatch(/prismaSystem[\s\S]{0,400}only to that email's inbox/);
  });

  it("the redirect carries no data — a bare literal, no interpolation", () => {
    expect(action).not.toMatch(/redirect\(`/);
    expect(action).not.toMatch(/redirect\([^)]*\$\{/);
  });
});

describe("the finder is reachable but not indexed", () => {
  it("the proxy serves /find on the apex", () => {
    expect(read("src/proxy.ts")).toContain('"/find"');
  });

  it("robots disallows /find", () => {
    expect(read("src/app/robots.txt/route.ts")).toContain('"Disallow: /find"');
  });

  it("the sign-in notice links to it", () => {
    expect(read("src/app/page.tsx")).toContain('href="/find"');
  });

  it("the page is apex-only", () => {
    expect(page).toContain('kind.kind !== "apex"');
    expect(page).toContain('redirect("/")');
  });
});
