// The family tier's tailoring: FAMILY_NAV structure, and the fail-closed rule
// that every school-only route in the teacher console uses the kind guard.
//
// WHY A SCAN. requireTeacher() passes a family owner everywhere by design (a
// family IS a one-teacher tenant). So the only thing keeping a household out
// of "Build packets for 0 students" or the staff messaging inbox is that each
// school-only page calls requireSchoolTeacher(). A new page that forgets is
// a silent regression — this test makes it a build failure instead.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  FAMILY_NAV,
  TEACHER_NAV,
  navForKind,
  parsePins,
  allItems,
  DEFAULT_PINS,
  DEFAULT_PINS_FAMILY,
} from "../src/lib/nav";

const ROOT = join(__dirname, "..");
const TEACHER_DIR = join(ROOT, "src/app/(teacher)");

/** Route dirs a family may open. Everything else under (teacher) is
 *  school-only and must gate with requireSchoolTeacher(). */
const FAMILY_ROUTE_DIRS = new Set([
  "dashboard",
  "notifications",
  "attendance",
  "observations",
  "students",
  "outcomes",
  "mastery",
  "reports",
  "calendar",
  "evidence",
  "settings",
  "audit",
  "claims",
]);

function pageFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pageFiles(p, out);
    else if (name === "page.tsx" || name === "route.ts") out.push(p);
  }
  return out;
}

describe("FAMILY_NAV", () => {
  it("is a strict subset of the teacher console — a family reaches nothing a school can't", () => {
    const teacherHrefs = new Set(allItems(TEACHER_NAV).map((i) => i.href));
    for (const item of allItems(FAMILY_NAV)) {
      // /claims is the one family-only route (schools invoice instead).
      if (item.href === "/claims") continue;
      expect(teacherHrefs.has(item.href), item.href).toBe(true);
    }
  });
  it("carries none of the school-only surfaces", () => {
    const hrefs = allItems(FAMILY_NAV).map((i) => i.href);
    for (const banned of ["/invoices", "/billing", "/cashflow", "/invites", "/conferences", "/messages", "/announcements", "/email", "/gradebook", "/grading", "/banks", "/paths", "/sources", "/proposals"]) {
      expect(hrefs).not.toContain(banned);
    }
  });
  it("is well-formed: unique hrefs, ≤8 per group, unique group names", () => {
    const hrefs = allItems(FAMILY_NAV).map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const g of FAMILY_NAV) expect(g.items.length).toBeLessThanOrEqual(8);
    const names = FAMILY_NAV.map((g) => g.group);
    expect(new Set(names).size).toBe(names.length);
  });
  it("navForKind picks by kind and defaults to the teacher console", () => {
    expect(navForKind("family")).toBe(FAMILY_NAV);
    expect(navForKind("school")).toBe(TEACHER_NAV);
    expect(navForKind(undefined)).toBe(TEACHER_NAV);
  });
  it("family default pins exist in FAMILY_NAV; teacher defaults stay for schools", () => {
    const fam = new Set(allItems(FAMILY_NAV).map((i) => i.href));
    for (const p of DEFAULT_PINS_FAMILY) expect(fam.has(p), p).toBe(true);
    expect(parsePins(null, FAMILY_NAV)).toEqual(DEFAULT_PINS_FAMILY);
    expect(parsePins(null)).toEqual(DEFAULT_PINS);
    // A stored school pin that isn't in the family nav is dropped, not kept.
    expect(parsePins(JSON.stringify(["/dashboard", "/billing"]), FAMILY_NAV)).toEqual(["/dashboard"]);
  });
});

describe("school-only routes gate with requireSchoolTeacher (fail-closed scan)", () => {
  const files = pageFiles(TEACHER_DIR);
  it("finds the console", () => {
    expect(files.length).toBeGreaterThan(20);
  });
  for (const f of files) {
    const rel = f.slice(TEACHER_DIR.length + 1);
    const top = rel.split("/")[0];
    if (FAMILY_ROUTE_DIRS.has(top)) continue;
    it(`${rel} uses requireSchoolTeacher()`, () => {
      const src = readFileSync(f, "utf8");
      // A page that gates at all must gate with the school guard.
      if (/require(Teacher|SchoolTeacher)\(/.test(src)) {
        expect(src).toContain("requireSchoolTeacher(");
        expect(src).not.toMatch(/\brequireTeacher\(/);
      }
    });
  }
});

describe("the guard itself", () => {
  it("sends a family home rather than to a broken page", () => {
    const auth = readFileSync(join(ROOT, "src/lib/auth.ts"), "utf8");
    const fn = auth.slice(auth.indexOf("export async function requireSchoolTeacher"));
    expect(fn).toContain('session.school?.kind === "family"');
    expect(fn).toContain('redirect("/dashboard")');
  });
  it("the layout picks nav and role label by kind", () => {
    const layout = readFileSync(join(ROOT, "src/app/(teacher)/layout.tsx"), "utf8");
    expect(layout).toContain("navForKind(school?.kind)");
    expect(layout).toContain("parsePins(user.pinnedNav, nav)");
    expect(layout).toContain("copy.ownerLabel");
  });
});

describe("family dashboard, onboarding, rules notes", () => {
  const dash = readFileSync(join(ROOT, "src/app/(teacher)/dashboard/page.tsx"), "utf8");
  const famDash = readFileSync(join(ROOT, "src/app/(teacher)/dashboard/FamilyDashboard.tsx"), "utf8");
  const onboarding = readFileSync(join(ROOT, "src/app/(teacher)/dashboard/OnboardingModal.tsx"), "utf8");
  const settings = readFileSync(join(ROOT, "src/app/(teacher)/settings/page.tsx"), "utf8");

  it("the dashboard branches to FamilyDashboard before any school query", () => {
    expect(dash.indexOf("if (isFamily(school)) return <FamilyDashboard")).toBeLessThan(
      dash.indexOf("prisma.student.findMany")
    );
  });
  it("the family dashboard reads CLAIMS, not invoices, and has no grading queue / provider nudge", () => {
    expect(famDash).toContain("prisma.expenseClaim.findMany");
    expect(famDash).not.toContain("prisma.invoice");
    expect(famDash).not.toContain("Grading queue");
    expect(famDash).not.toContain("providerNudge");
    expect(famDash).toContain("reimbursementMetrics(claims)");
    // Onboarding line stays owner-only, same contract as the school.
    expect(famDash).toContain('user.role === "owner" && !school.onboardedAt');
  });
  it("onboarding keeps the same field names for both kinds", () => {
    expect(onboarding).toContain('kind?: "school" | "family"');
    for (const name of ["contactPhone", "studentEstimate", "gradesServed", "heardFrom", "priorTooling"]) {
      expect(onboarding).toContain(`name="${name}"`);
    }
  });
  it("settings hides the provider-ID card for a family", () => {
    expect(settings).toContain("{!family && (");
    expect(settings.indexOf("{!family && (")).toBeLessThan(settings.indexOf("Your provider ID"));
  });
});
