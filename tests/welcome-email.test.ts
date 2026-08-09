// The welcome email: the permanent record of a school's address, sent at the
// one moment we know the founder is paying attention. Two properties matter —
// it exists, and it can never break signup.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const action = readFileSync(join(process.cwd(), "src/app/signup/actions.ts"), "utf8");

describe("the signup welcome email", () => {
  it("is sent, and before the sign-in handoff redirect", () => {
    const send = action.indexOf("sendEmail");
    const handoff = action.indexOf("signin_handoff");
    expect(send).toBeGreaterThan(-1);
    expect(send).toBeLessThan(handoff);
  });

  it("carries the school's permanent address", () => {
    expect(action).toMatch(/schoolOrigin \|\| appUrl\(\)/);
  });

  it("is best-effort — its result never gates the signup flow", () => {
    // sendEmail's return value must not be checked: a mail outage breaking
    // signup would be the tail wagging the dog. The call is awaited bare.
    expect(action).toMatch(/await sendEmail\(\{/);
    expect(action).not.toMatch(/const \w+ = await sendEmail/);
    expect(action).not.toMatch(/sendEmail[\s\S]{0,600}?\.sent/);
  });

  it("reads as a welcome, with the first steps in it", () => {
    expect(action).toContain("Welcome to Cohort");
    expect(action).toContain("Add your students");
    expect(action).toContain("term dates");
    expect(action).toContain("attendance");
  });
});
