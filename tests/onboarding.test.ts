// The owner onboarding popup: shows once, only to owners, dismissible either
// way, and everything it collects surfaces in the operator's school panel.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const actions = read("src/app/(teacher)/actions.ts");
const dashboard = read("src/app/(teacher)/dashboard/page.tsx");
const modal = read("src/app/(teacher)/dashboard/OnboardingModal.tsx");
const adminPage = read("src/app/cohort-admin/schools/page.tsx");
const adminView = read("src/app/cohort-admin/schools/SchoolsView.tsx");

describe("the onboarding popup", () => {
  it("shows only for an owner whose school hasn't onboarded", () => {
    expect(dashboard).toContain('user.role === "owner" && !school!.onboardedAt');
  });

  it("the action is tenant-gated and owner-only", () => {
    const fn = actions.slice(actions.indexOf("export async function completeOnboarding"));
    expect(fn).toContain("await requireTeacher()");
    expect(fn).toContain('user.role !== "owner"');
  });

  it("saving AND skipping both stamp onboardedAt — the popup never shows twice", () => {
    const fn = actions.slice(actions.indexOf("export async function completeOnboarding"));
    expect(fn).toContain('formData.get("skip") === "1"');
    // Both branches of the update write the stamp.
    const stamps = fn.split("onboardedAt: new Date()").length - 1;
    expect(stamps).toBeGreaterThanOrEqual(2);
  });

  it("select answers are validated against allowlists, not stored raw", () => {
    const fn = actions.slice(actions.indexOf("export async function completeOnboarding"));
    expect(fn).toContain("HEARD_FROM.has(");
    expect(fn).toContain("PRIOR_TOOLING.has(");
  });

  it("skip is a real escape hatch on the form", () => {
    expect(modal).toContain('name="skip"');
    expect(modal).toContain("formNoValidate");
  });
});

describe("what the operator sees", () => {
  it("the school panel carries the owner's name, email and phone", () => {
    expect(adminPage).toMatch(/select: \{ schoolId: true, email: true, name: true \}/);
    expect(adminView).toContain("ownerName");
    expect(adminView).toContain("ownerEmail");
    expect(adminView).toContain("contactPhone");
  });

  it("and the intake answers", () => {
    for (const f of ["studentEstimate", "gradesServed", "heardFrom", "priorTooling"]) {
      expect(adminPage, f).toContain(f);
      expect(adminView, f).toContain(f);
    }
  });
});
