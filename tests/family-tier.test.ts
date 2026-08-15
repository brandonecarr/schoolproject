// The homeschool-family account kind: one discriminator (School.kind), read
// at a few choke points, on top of the same engine. These pin the invariants
// that make a second kind safe — server-side whitelisting, a separate price
// that never falls back to the school rate, both tiers on the landing, and
// the family door closing cleanly when its price is absent.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseKind, isFamily, copyFor, PRICE_USD } from "../src/lib/kind";
import { RESERVED_SLUGS } from "../src/lib/tenant";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const schema = read("prisma/schema.prisma");
const signupAction = read("src/app/signup/actions.ts");
const signupPage = read("src/app/signup/page.tsx");
const provision = read("src/lib/provision.ts");
const stripe = read("src/lib/stripe.ts");
const landing = read("src/app/page.tsx");

describe("the kind helper", () => {
  it("whitelists: only the literal 'family' is a family", () => {
    expect(parseKind("family")).toBe("family");
    expect(parseKind("school")).toBe("school");
    expect(parseKind("FAMILY")).toBe("school");
    expect(parseKind(undefined)).toBe("school");
    expect(parseKind({ toString: () => "family" })).toBe("school");
  });
  it("isFamily/copyFor read the school row and nothing else", () => {
    expect(isFamily({ kind: "family" })).toBe(true);
    expect(isFamily({ kind: "school" })).toBe(false);
    expect(isFamily(null)).toBe(false);
    expect(copyFor({ kind: "family" }).students).toBe("Children");
    expect(copyFor({ kind: "school" }).students).toBe("Students");
  });
  it("prices are stated once", () => {
    expect(PRICE_USD.school).toBe(149);
    expect(PRICE_USD.family).toBe(29);
  });
});

describe("schema", () => {
  it("School and SignupIntent carry kind, defaulting to school (the backfill)", () => {
    const school = schema.slice(schema.indexOf("model School {"), schema.indexOf("model User {"));
    expect(school).toContain('kind      String   @default("school")');
    const intent = schema.slice(schema.indexOf("model SignupIntent {"));
    expect(intent).toContain('kind            String    @default("school")');
  });
  it("families cannot claim the generic words as their address", () => {
    for (const w of ["family", "families", "home", "homeschool", "parent", "parents"]) {
      expect(RESERVED_SLUGS.has(w), w).toBe(true);
    }
  });
});

describe("signup", () => {
  it("re-validates kind server-side and never asks a family for an ESA amount", () => {
    expect(signupAction).toContain('parseKind(formData.get("kind"))');
    expect(signupAction).toContain('kind === "family" ? 0 :');
  });
  it("carries kind into the intent AND direct provisioning", () => {
    const gated = signupAction.slice(signupAction.indexOf("if (stripeConfigured())"));
    const branch = gated.slice(0, gated.indexOf("// ---- No Stripe configured"));
    expect(branch).toMatch(/signupIntent\.create\(\{\s*data: \{\s*kind,/);
    const fallback = signupAction.slice(signupAction.indexOf("// ---- No Stripe configured"));
    expect(fallback).toMatch(/provisionSchool\(\{\s*kind,/);
  });
  it("a family with no family price is REFUSED — never billed the school rate", () => {
    const gated = signupAction.slice(signupAction.indexOf("if (stripeConfigured())"));
    const branch = gated.slice(0, gated.indexOf("// ---- No Stripe configured"));
    expect(branch).toContain("priceIdFor(kind)");
    expect(branch).toContain('err("familybilling")');
    // The refusal precedes the intent create: nothing is recorded for a closed door.
    expect(branch.indexOf('err("familybilling")')).toBeLessThan(branch.indexOf("signupIntent.create"));
    expect(branch).toContain("priceId,");
    expect(signupPage).toContain("familybilling:");
  });
  it("the page offers both kinds and disables submit when the family door is closed", () => {
    expect(signupPage).toContain('href="/signup?kind=school"');
    expect(signupPage).toContain('href="/signup?kind=family"');
    expect(signupPage).toContain("familyTierOpen()");
    expect(signupPage).toContain("disabled={familyClosed}");
    // The field stays named schoolName for both kinds — SlugField depends on it.
    expect(signupPage).toContain('name="schoolName"');
  });
});

describe("Stripe", () => {
  it("stripeConfigured() still means the SCHOOL price — the paywall switch is unchanged", () => {
    expect(stripe).toContain(
      "return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);"
    );
  });
  it("priceIdFor resolves per kind and the checkout call takes a priceId", () => {
    expect(stripe).toContain('if (kind === "family") return process.env.STRIPE_PRICE_ID_FAMILY || null;');
    expect(stripe).toContain('"line_items[0][price]": opts.priceId ?? process.env.STRIPE_PRICE_ID!');
  });
});

describe("provisioning", () => {
  it("writes kind and gives families the longer retention default", () => {
    expect(provision).toContain("kind,");
    expect(provision).toContain('kind === "family" ? { retentionDays: 1825 } : {}');
    expect(provision).toContain('kind: intent.kind === "family" ? "family" : "school"');
  });
});

describe("the landing keeps both promises", () => {
  it("shows a school tier and a family tier, each with its CTA", () => {
    expect(landing).toContain("lp-tiers-2");
    expect(landing).toContain("$149");
    expect(landing).toContain("$29");
    expect(landing).toContain('href="/signup?kind=school"');
    expect(landing).toContain('href="/signup?kind=family"');
    expect(landing).toContain("Start your homeschool");
    // The family, too, submits its own claims — Cohort is never in the money path.
    expect(landing).toContain("You submit every claim yourself");
  });
});

describe("home-education notes in rules.ts", () => {
  it("every note ends with the ⚑ confirm line — a note, never an eligibility ruling", async () => {
    const { PROGRAMS } = await import("../src/lib/rules");
    const noted = Object.entries(PROGRAMS).filter(([, p]) => p.homeEducation);
    expect(noted.length).toBeGreaterThanOrEqual(5);
    for (const [code, p] of noted) {
      expect(p.homeEducation!.endsWith("⚑ Confirm in your award letter or program portal."), code).toBe(true);
      expect(/eligible|approved|guaranteed/i.test(p.homeEducation!.replace(/⚑.*$/, "")), `${code} asserts eligibility`).toBe(false);
    }
  });
});
