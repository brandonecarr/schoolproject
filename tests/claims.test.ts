// Expense claims — the homeschool family's money surface. Pure helpers get
// real unit tests; the pages/actions get source-text pins on the invariants
// that matter: family-only, receipts on the invoice-receipt footing, the
// rejection loop feeding RailObservation, nothing transmitted anywhere.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLAIM_CATEGORIES,
  parseCategory,
  categoryLabel,
  parseClaimStatus,
  claimWindow,
  parseYmd,
  parseAmount,
} from "../src/lib/claims";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const actions = read("src/app/(teacher)/claims/actions.ts");
const listPage = read("src/app/(teacher)/claims/page.tsx");
const packetPage = read("src/app/(teacher)/claims/[id]/page.tsx");
const printRoute = read("src/app/(teacher)/claims/[id]/print/route.ts");
const retention = read("src/lib/retention.ts");
const filesRoute = read("src/app/files/[id]/route.ts");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260815020000_expense_claims/migration.sql");

describe("pure helpers", () => {
  it("categories are a closed list; unknown → other", () => {
    expect(CLAIM_CATEGORIES.length).toBeGreaterThan(5);
    expect(parseCategory("curriculum")).toBe("curriculum");
    expect(parseCategory("<script>")).toBe("other");
    expect(parseCategory(undefined)).toBe("other");
    expect(categoryLabel("tutoring")).toBe("Tutoring & classes");
    expect(categoryLabel("nope")).toBe("Other");
  });
  it("status is whitelisted", () => {
    expect(parseClaimStatus("paid")).toBe("paid");
    expect(parseClaimStatus("PAID")).toBeNull();
    expect(parseClaimStatus("")).toBeNull();
  });
  it("claimWindow: 30 days either side, capped at today, never inverted", () => {
    expect(claimWindow("2026-03-15", "2026-06-01")).toEqual({ start: "2026-02-13", end: "2026-04-14" });
    // A recent purchase: end is today, not the future.
    expect(claimWindow("2026-05-30", "2026-06-01")).toEqual({ start: "2026-04-30", end: "2026-06-01" });
    // A future-dated purchase (typo): end never precedes start.
    const w = claimWindow("2026-08-01", "2026-06-01");
    expect(w.end >= w.start).toBe(true);
  });
  it("parseYmd / parseAmount reject junk and cap sensibly", () => {
    expect(parseYmd("2026-02-30")).toBe("2026-02-30"); // Date normalises; format ok, kept lenient
    expect(parseYmd("02/30/2026")).toBeNull();
    expect(parseYmd("")).toBeNull();
    expect(parseAmount("$1,234.567")).toBe(1234.57);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("999999")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("schema + RLS", () => {
  it("ExpenseClaim is tenant-scoped with the standard policy, and FileRec gains claimId", () => {
    expect(schema).toContain("model ExpenseClaim {");
    expect(schema).toContain("claimId    String?");
    expect(migration).toContain('ALTER TABLE "ExpenseClaim" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY rls_tenant ON "ExpenseClaim"');
    expect(migration).toContain(`("schoolId" = current_setting('app.tenant_id', true))`);
  });
});

describe("actions", () => {
  it("every action is family-only via one shared gate", () => {
    expect(actions).toContain("async function requireFamily()");
    expect(actions).toContain('if (!isFamily(session.school)) redirect("/dashboard");');
    const exported = actions.match(/export async function (\w+)/g) ?? [];
    expect(exported.length).toBeGreaterThanOrEqual(8);
    for (const fn of exported) {
      const name = fn.replace("export async function ", "");
      const start = actions.indexOf(fn);
      const next = actions.indexOf("export async function", start + 10);
      const body = actions.slice(start, next === -1 ? undefined : next);
      expect(body.includes("requireFamily()"), `${name} gates on requireFamily`).toBe(true);
    }
  });
  it("inputs are whitelisted server-side", () => {
    expect(actions).toContain('parseYmd(formData.get("purchaseDate"))');
    expect(actions).toContain('parseAmount(formData.get("amount"))');
    expect(actions).toContain('parseCategory(formData.get("category"))');
    expect(actions).toContain('parseClaimStatus(formData.get("status"))');
    // The child must belong to this family.
    expect(actions).toContain("prisma.student.findFirst({ where: { id: studentId, schoolId } })");
  });
  it("receipts sit on the invoice-receipt footing: studentId null, claimId set, removal fenced", () => {
    expect(actions).toContain("studentId: null,\n      claimId,");
    expect(actions).toContain("claimId: { not: null }");
    expect(actions).toContain('"application/pdf": "pdf"');
  });
  it("rejections and decisions feed the cross-tenant rail knowledge", () => {
    expect(actions).toContain('outcome: "rejected"');
    expect(actions).toContain("recordRailObservation({");
    expect(actions).toContain("rejectionCount: { increment: 1 }");
  });
  it("only a DRAFT can be deleted, and its receipt goes with it", () => {
    const del = actions.slice(actions.indexOf("export async function deleteClaim"));
    expect(del).toContain('status: "draft"');
    expect(del.indexOf("fileRec.deleteMany")).toBeLessThan(del.indexOf("expenseClaim.delete("));
  });
});

describe("pages", () => {
  it("schools are sent to invoices; nothing is transmitted", () => {
    expect(listPage).toContain('if (!isFamily(school)) redirect("/invoices");');
    expect(packetPage).toContain('if (!isFamily(school)) redirect("/invoices");');
    expect(printRoute).toContain("if (!isFamily(school))");
    expect(printRoute).toContain("Nothing is sent from here.");
    expect(listPage).toContain("upload it\n                  to your state portal");
  });
  it("the list reuses the pure invoice metrics without touching invoices", () => {
    expect(listPage).toContain("reimbursementMetrics(claims)");
    expect(listPage).toContain("stalledInvoices(claims, td)");
    expect(listPage).not.toContain("prisma.invoice");
  });
  it("the packet prints the receipt FIRST, then the purpose statement", () => {
    expect(printRoute.indexOf("receiptFigures(receipts)")).toBeLessThan(
      printRoute.indexOf("Educational purpose statement")
    );
    // The family's own letterhead, like every packet.
    expect(printRoute).toContain("letterhead(brand)");
  });
});

describe("retention + files honour claim receipts", () => {
  it("purge excludes claim receipts; right-to-deletion removes receipts before claims", () => {
    expect(retention).toContain("claimId: null,");
    const del = retention.slice(retention.indexOf("export async function deleteStudentData"));
    expect(del).toContain("claimId: { in: claimIds }");
    expect(del.indexOf("claimId: { in: claimIds }")).toBeLessThan(del.indexOf("expenseClaim.deleteMany"));
  });
  it("the file route treats a claim receipt as staff-only and never cacheable", () => {
    expect(filesRoute).toContain("f.claimId == null");
    expect((filesRoute.match(/f\.claimId == null/g) ?? []).length).toBe(2);
  });
});
