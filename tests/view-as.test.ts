import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// "View as" is read-only, and this file is what keeps it that way.
//
// The guard itself is one line per action, which is exactly the kind of thing
// someone forgets on the thirteenth action six months from now. So rather than
// trusting review, these tests read the source and fail the build if a portal
// action can write while a staff member is impersonating a family member.
//
// Source inspection is a blunt instrument and it is the right one here: the
// alternative is booting Next, a database and a session per action, which
// nobody would run often enough to catch the regression.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Split a TypeScript file into top-level function bodies. */
function functions(src: string): { name: string; exported: boolean; body: string }[] {
  const parts = src.split(/\n(?=(?:export )?async function )/);
  const out: { name: string; exported: boolean; body: string }[] = [];
  for (const chunk of parts) {
    const m = /^(export )?async function (\w+)/.exec(chunk);
    if (m) out.push({ name: m[2], exported: Boolean(m[1]), body: chunk });
  }
  return out;
}

describe("every portal action refuses to write while impersonating", () => {
  const src = read("src/app/(portal)/actions.ts");
  const fns = functions(src);
  const exported = fns.filter((f) => f.exported);
  const helperNames = fns.filter((f) => !f.exported).map((f) => f.name);

  it("finds the actions at all — the parser must not silently match nothing", () => {
    expect(exported.length).toBeGreaterThan(10);
  });

  it.each(exported.map((f) => [f.name, f] as const))(
    "%s is guarded",
    (_name, fn) => {
      const direct = fn.body.includes("requireNotViewing");
      // A helper that resolves the session may carry the guard instead.
      const viaHelper = helperNames.some(
        (h) =>
          fn.body.includes(`${h}(`) &&
          (fns.find((x) => x.name === h)?.body.includes("requireNotViewing") ?? false)
      );
      expect(
        direct || viaHelper,
        `${fn.name} can write while a staff member is viewing as this user. ` +
          `Add \`await requireNotViewing(session)\`, or route it through a helper that does.`
      ).toBe(true);
    }
  );
});

describe("teacher actions are blocked structurally, not by a guard", () => {
  const src = read("src/app/(teacher)/actions.ts");

  it("every teacher action goes through requireTeacher", () => {
    // This is why the console needs no explicit guard: impersonation swaps in a
    // parent or student, so requireTeacher redirects before any action body
    // runs. If an action ever resolves its session another way, that reasoning
    // stops holding and this test says so.
    for (const fn of functions(src).filter((f) => f.exported)) {
      // requireSchoolTeacher() calls requireTeacher() first, so either gate
      // carries the impersonation refusal.
      const gated = fn.body.includes("requireTeacher()") || fn.body.includes("requireSchoolTeacher()");
      expect(gated, `${fn.name} does not call requireTeacher()/requireSchoolTeacher()`).toBe(true);
    }
  });
});

describe("the session layer", () => {
  const src = read("src/lib/auth.ts");

  it("only ever impersonates a non-staff user in the same school", () => {
    // Reading the conditions rather than the prose: a staff member must not be
    // able to view as another staff member (no lateral privilege peeking), and
    // never across schools.
    expect(src).toContain("target.schoolId === signedIn.schoolId");
    expect(src).toContain("!isStaffRole(target.role)");
    expect(src).toContain("isStaffRole(signedIn.role)");
  });

  it("clears the view rather than failing open when anything is off", () => {
    expect(src).toContain("viewingAsUserId: null");
  });

  it("keeps the real actor separate from the viewed user", () => {
    // Audit entries must name the staff member, never the family member being
    // viewed — otherwise the log records a parent doing things they didn't.
    expect(src).toMatch(/actor: User \| null/);
  });
});
