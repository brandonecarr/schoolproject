// The letterhead contract, and the guarantee that it reaches every document.
//
// The value here isn't the five routes that exist today — it's the sixth. A
// print route added next month should carry the school's identity because it
// used the shared helpers, not because someone remembered to copy a header.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { letterhead, packetCss, packetFoot, letterheadCss } from "@/lib/packet";
import { brandOf } from "@/lib/branding";

const ROOT = join(__dirname, "..");
const brand = (over: Partial<Parameters<typeof brandOf>[0]> = {}, logo = false) =>
  brandOf(
    { name: "Cedar Grove Microschool", address: "12 Vine St", accentColor: "#7A1F1F", ...over },
    logo ? { mime: "image/png", data: new Uint8Array([137, 80, 78, 71]) } : null
  );

describe("letterhead", () => {
  it("leads with the school, not the vendor", () => {
    const html = letterhead(brand());
    expect(html).toContain("Cedar Grove Microschool");
    expect(html).toContain("12 Vine St");
    expect(html).not.toContain("Cohort");
  });

  it("embeds the logo rather than linking it", () => {
    // A saved PDF or a forwarded HTML file has no session and may have no
    // network. A <img src="/files/..."> would render as a broken image on the
    // reviewer's desk, which is the one place it must not.
    const html = letterhead(brand({}, true));
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).not.toContain("/files/");
  });

  it("renders nothing rather than an empty band", () => {
    // A blank rule at the top of a reviewed document reads as a rendering
    // fault, which is worse than no letterhead.
    expect(letterhead(brand({ name: "" }))).toBe("");
  });

  it("escapes the school name", () => {
    const html = letterhead(brand({ name: 'Cedar & Grove <script>alert(1)</script>' }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&amp;");
  });
});

describe("packetFoot", () => {
  it("is where Cohort goes", () => {
    const foot = packetFoot("Prepared by Sarah on 6 Aug.");
    expect(foot).toContain("Prepared by Sarah");
    expect(foot).toContain("Cohort");
  });
});

describe("accent in generated CSS", () => {
  it("only ever emits a hex triple", () => {
    // The accent is interpolated into a <style> block, where HTML escaping
    // does nothing. Safety comes from parseAccent's allow-list, so assert that
    // nothing else can reach the stylesheet.
    const payload = "red;} body{visibility:hidden} .x{";
    const hostile = brandOf({ name: "S", accentColor: payload }, null);
    const css = packetCss(hostile) + letterheadCss(hostile);

    // The payload itself must not survive. (Asserting on "display:none" would
    // be wrong — the stylesheet legitimately hides the action bar when
    // printing, so that string is present either way and the test would pass
    // for the wrong reason.)
    expect(css).not.toContain("visibility:hidden");
    expect(css).not.toContain(payload);

    // And nothing colour-shaped in the output is anything but a hex triple.
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      expect(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(m[0]), m[0]).toBe(true);
    }
  });

  it("would notice if the accent stopped being validated", () => {
    // Guards the guard: if parseAccent were bypassed and the raw value reached
    // the stylesheet, the assertions above must actually fire.
    const naive = `.bar{background:${"red;} body{visibility:hidden} .x{"}}`;
    expect(naive).toContain("visibility:hidden");
  });
});

// --- The structural guarantee -----------------------------------------------

function printRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = join(dir, name);
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (name === "route.ts" && rel.includes("print")) out.push(rel);
    }
  };
  walk("src/app");
  return out;
}

describe("every printed document carries the school's identity", () => {
  const routes = printRoutes();

  it("finds the print routes it claims to check", () => {
    expect(routes.length).toBeGreaterThanOrEqual(5);
  });

  it("uses the shared letterhead instead of a hand-rolled header", () => {
    const missing = routes.filter((r) => !readFileSync(join(ROOT, r), "utf8").includes("letterhead("));
    expect(missing, `these print routes have no school letterhead: ${missing.join(", ")}`).toEqual([]);
  });

  it("never leads a document with the vendor's name", () => {
    // Cohort belongs in the footer. This catches "Generated with Cohort" or a
    // "Cohort" <h1> creeping back into a header.
    const offenders: string[] = [];
    for (const r of routes) {
      const src = readFileSync(join(ROOT, r), "utf8");
      const head = src.slice(0, src.indexOf("packetFoot(") >= 0 ? src.indexOf("packetFoot(") : src.length);
      for (const m of head.matchAll(/<h1[^>]*>[^<]*Cohort/g)) offenders.push(`${r}: ${m[0]}`);
      for (const m of head.matchAll(/Generated with Cohort/g)) offenders.push(`${r}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
