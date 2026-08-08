// Receipts on invoices: the taxonomy that keeps a financial record from being
// treated as child data, and vice versa.
//
// The whole feature rests on one classification: a receipt is a FileRec with
// invoiceId set and studentId null. From that follow three promises —
//   1. the COPPA purge never deletes one (financial records are kept for
//      reimbursement audit),
//   2. right-to-deletion still removes them WITH the child's invoices,
//   3. they are staff-only in the files route, unlike the school resources
//      that share their null studentId.
// Each promise is a where-clause somewhere, which is exactly the kind of thing
// that decays silently. These tests hold them.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { receiptFigures } from "@/lib/packet";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the packet's receipts section", () => {
  const receipts = [
    { id: "f1", label: "amazon-order-1123.png", mime: "image/png" },
    { id: "f2", label: "tutor-invoice.pdf", mime: "application/pdf" },
  ];

  it("renders images inline and PDFs as named placeholders", () => {
    const html = receiptFigures(receipts);
    expect(html).toContain("Receipts (2)");
    expect(html).toContain('src="/files/f1"');
    expect(html).toContain("PDF attachment");
    expect(html).toContain("tutor-invoice.pdf");
  });

  it("renders nothing at all when there are none", () => {
    // An empty "Receipts" heading on a reimbursement packet reads as documents
    // withheld, which is worse than no heading.
    expect(receiptFigures([])).toBe("");
  });

  it("escapes labels — a filename is user input landing in generated HTML", () => {
    const html = receiptFigures([
      { id: "x", label: '"><script>alert(1)</script>', mime: "image/png" },
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("the retention taxonomy", () => {
  const retention = read("src/lib/retention.ts");

  it("the purge cannot eat a receipt", () => {
    // studentId: { not: null } already excludes them (receipts carry null),
    // and invoiceId: null is the belt-and-braces for a future change that
    // gives a receipt a studentId.
    const purge = retention.slice(
      retention.indexOf("export async function purgeSchool"),
      retention.indexOf("export async function purgeAllSchools")
    );
    expect(purge).toContain("invoiceId: null");
  });

  it("right-to-deletion removes the child's receipts with their invoices", () => {
    const del = retention.slice(retention.indexOf("export async function deleteStudentData"));
    expect(del).toContain("invoiceId: { in: invoiceIds }");
    // The receipt delete must run BEFORE the invoice delete, or the join key
    // is gone and the receipts orphan.
    expect(del.indexOf("invoiceId: { in: invoiceIds }")).toBeLessThan(
      del.indexOf("prisma.invoice.deleteMany")
    );
  });
});

describe("who may read a receipt", () => {
  it("invoice-attached files are staff-only, unlike other null-student files", () => {
    const route = read("src/app/files/[id]/route.ts");
    expect(route).toContain("f.invoiceId == null");
  });
});

describe("the actions stay in their lane", () => {
  const actions = read("src/app/(teacher)/actions.ts");

  it("uploads verify the invoice belongs to the school before writing", () => {
    const up = actions.slice(actions.indexOf("export async function uploadReceipt"));
    expect(up.indexOf("prisma.invoice.findFirst")).toBeLessThan(
      up.indexOf("prisma.fileRec.create")
    );
  });

  it("uploads store studentId null and a bounded label", () => {
    const up = actions.slice(
      actions.indexOf("export async function uploadReceipt"),
      actions.indexOf("export async function removeReceipt")
    );
    expect(up).toContain("studentId: null");
    expect(up).toMatch(/\.slice\(0, \d+\)/); // label length bound
  });

  it("accepts PDF but never SVG", () => {
    // RECEIPT_TYPES sits above the action; check the declaration itself.
    const types = actions.slice(
      actions.indexOf("const RECEIPT_TYPES"),
      actions.indexOf("export async function uploadReceipt")
    );
    expect(types).toContain('"application/pdf"');
    expect(types).not.toContain("svg");
  });

  it("removal can only ever delete receipts", () => {
    const rm = actions.slice(actions.indexOf("export async function removeReceipt"));
    // The where-clause requires invoiceId to be set — a work sample or the
    // school logo can never match it.
    expect(rm).toContain("invoiceId: { not: null }");
  });
});
