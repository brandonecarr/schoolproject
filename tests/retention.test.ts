// The retention purge deletes children's records permanently and on a timer.
// It needs a database to run, so this reads its source instead and pins the
// two properties that matter — which is worth doing precisely because there is
// no safe way to exercise the real thing.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "..", "src/lib/retention.ts"), "utf8");

/** The body of one exported function. */
function bodyOf(name: string): string {
  const i = SRC.indexOf(`export async function ${name}`);
  expect(i, `${name} not found — did it get renamed?`).toBeGreaterThan(-1);
  const next = SRC.slice(i + 1).search(/\nexport /);
  return next === -1 ? SRC.slice(i) : SRC.slice(i, i + 1 + next);
}

describe("purgeSchool", () => {
  const body = bodyOf("purgeSchool");

  it("only purges files that belong to a child", () => {
    // A FileRec with a null studentId is not child data — it is a teacher's
    // assignment resource or the school's logo, and the retention window does
    // not govern either. Without this scoping the nightly job deletes a
    // school's letterhead two years after they upload it, which is both wrong
    // and very hard to attribute to a COPPA purge.
    const fileDelete = body.slice(body.indexOf("prisma.fileRec.deleteMany"));
    const call = fileDelete.slice(0, fileDelete.indexOf("})") + 2);
    expect(call).toContain("studentId");
    expect(call).toMatch(/studentId:\s*\{\s*not:\s*null\s*\}/);
  });

  it("still purges every child-activity table on the clock", () => {
    // The scoping above must not have quietly narrowed anything else. These
    // four are the child-activity records the retention obligation covers.
    for (const table of ["attendance", "observation", "submission", "fileRec"]) {
      expect(body, table).toContain(`prisma.${table}.deleteMany`);
    }
    // And each is bounded by the cutoff rather than deleting wholesale.
    expect(body.match(/lt:\s*cutoff/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("leaves financial records alone", () => {
    // Kept for reimbursement audit. A full family-deletion request removes
    // them; the timer does not.
    expect(body).not.toContain("prisma.invoice.deleteMany");
    expect(body).not.toContain("prisma.payment.deleteMany");
  });
});

describe("deleteStudentData", () => {
  const body = bodyOf("deleteStudentData");

  it("removes a child's files by studentId, so the scoping above loses nothing", () => {
    // This is the other half of the argument for narrowing the purge: every
    // file that belongs to a child is reachable by studentId here, so a
    // right-to-deletion request still takes all of them.
    expect(body).toMatch(/prisma\.fileRec\.deleteMany\(\{\s*where:\s*\{\s*studentId/);
  });

  it("does take the financial records", () => {
    expect(body).toContain("prisma.invoice.deleteMany");
    expect(body).toContain("prisma.payment.deleteMany");
  });
});
