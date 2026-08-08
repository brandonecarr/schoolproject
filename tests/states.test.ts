// The public per-state pages: same honesty contract as the landing page,
// enforced the same way. These pages are built to be found by strangers, which
// makes them the highest-leverage place to overclaim — so the tests pin the
// derivation to rules.ts and the caveats to the rendered copy.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { statePages, statePageBySlug, stateSlug } from "@/lib/states";
import { PROGRAMS, RAILS } from "@/lib/rules";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("statePages derivation", () => {
  it("covers every configured program — adding a state adds a page", () => {
    const codes = statePages().map((s) => s.code).sort();
    expect(codes).toEqual(Object.keys(PROGRAMS).sort());
  });

  it("slugs are unique, kebab-case, and name-based", () => {
    const slugs = statePages().map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(stateSlug("NH")).toBe("new-hampshire");
    expect(stateSlug("AZ")).toBe("arizona");
  });

  it("lookup round-trips", () => {
    for (const s of statePages()) {
      expect(statePageBySlug(s.slug)?.code).toBe(s.code);
    }
    expect(statePageBySlug("narnia")).toBeNull();
  });

  it("verification status comes from the rail, never from this module", () => {
    for (const s of statePages()) {
      const rail = RAILS[PROGRAMS[s.code].rail];
      expect(s.unverified).toBe(rail ? rail.verify : true);
    }
  });

  it("a program with a missing rail is flagged, not dropped and not guessed", () => {
    // Same rule as landing.ts: shrinking coverage silently and overclaiming
    // are both wrong; flagging is wrong in the safe direction.
    for (const s of statePages()) {
      if (!RAILS[PROGRAMS[s.code].rail]) {
        expect(s.railLabel).toBeNull();
        expect(s.unverified).toBe(true);
      }
    }
  });
});

describe("what the rendered pages promise", () => {
  const page = read("src/app/states/[slug]/page.tsx");
  const index = read("src/app/states/page.tsx");

  it("award amounts always travel with the approximate framing", () => {
    // The number appears exactly once on the page, inside the sentence that
    // disclaims it. If someone adds a second bare rendering, this breaks.
    expect(page).toContain("award letter");
    expect(index).toContain("award letter");
    expect(page.split("s.amount.toLocaleString()").length - 1).toBeLessThanOrEqual(2); // body + meta description
  });

  it("the unverified flag is rendered, and in the product's own words", () => {
    expect(page).toContain("s.unverified");
    expect(page).toContain("⚑");
    expect(index).toContain("⚑ Rules unverified");
  });

  it("obligation dates stay absent by design, and the page says so", () => {
    expect(page).toContain("deliberately absent");
  });

  it("both pages are apex-only", () => {
    for (const src of [page, index]) {
      expect(src).toContain('kind.kind !== "apex"');
      expect(src).toContain('redirect("/")');
    }
  });
});

describe("discoverability wiring", () => {
  it("the sitemap lists every state page and only apex URLs", () => {
    const sitemap = read("src/app/sitemap.xml/route.ts");
    expect(sitemap).toContain("statePages()");
    expect(sitemap).toContain('kind.kind !== "apex"');
    expect(sitemap).toContain("404");
  });

  it("robots allows /states on the apex and advertises the sitemap", () => {
    const robots = read("src/app/robots.txt/route.ts");
    expect(robots).toContain('"Allow: /states"');
    expect(robots).toContain("sitemap.xml");
  });

  it("the proxy serves /states on the apex", () => {
    const proxy = read("src/proxy.ts");
    expect(proxy).toContain('"/states"');
  });

  it("the landing page links to the index", () => {
    expect(read("src/app/page.tsx")).toContain('href="/states"');
  });
});
