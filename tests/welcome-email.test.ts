// The welcome email: the permanent record of a school's address, sent at the
// one moment we know the founder is paying attention. Two properties matter —
// it exists, and it can never break signup. It lives in provisionSchool()
// now, so BOTH creation paths carry it: direct signup and paid fulfillment.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const provision = readFileSync(join(process.cwd(), "src/lib/provision.ts"), "utf8");
const action = readFileSync(join(process.cwd(), "src/app/signup/actions.ts"), "utf8");
const complete = readFileSync(join(process.cwd(), "src/app/signup/complete/page.tsx"), "utf8");

describe("the signup welcome email", () => {
  it("lives inside provisionSchool, so every creation path sends it", () => {
    const fn = provision.slice(
      provision.indexOf("export async function provisionSchool"),
      provision.indexOf("export async function fulfillSignupIntent"),
    );
    expect(fn).toContain("sendEmail");
  });

  it("is sent before the sign-in handoff on both paths", () => {
    // Direct path: provisionSchool (which emails) precedes the handoff token.
    expect(action.indexOf("provisionSchool")).toBeGreaterThan(-1);
    expect(action.indexOf("provisionSchool")).toBeLessThan(action.indexOf("signin_handoff"));
    // Paid path: fulfillment (which emails) precedes the handoff token.
    expect(complete.indexOf("fulfillSignupIntent")).toBeGreaterThan(-1);
    expect(complete.indexOf("fulfillSignupIntent")).toBeLessThan(complete.indexOf("signin_handoff"));
  });

  it("carries the school's permanent address", () => {
    expect(provision).toMatch(/schoolOrigin \|\| appUrl\(\)/);
  });

  it("is best-effort — its result never gates the signup flow", () => {
    // sendEmail's return value must not be checked: a mail outage breaking
    // signup would be the tail wagging the dog. The call is awaited bare.
    expect(provision).toMatch(/await sendEmail\(\{/);
    expect(provision).not.toMatch(/const \w+ = await sendEmail/);
    expect(provision).not.toMatch(/sendEmail[\s\S]{0,600}?\.sent/);
  });

  it("reads as a welcome, with the first steps in it", () => {
    expect(provision).toContain("Welcome to Cohort");
    expect(provision).toContain("Add your students");
    expect(provision).toContain("term dates");
    expect(provision).toContain("attendance");
  });
});
