-- Expense receipts attached to invoices.
--
-- Additive and nullable: every existing FileRec keeps working. A receipt is a
-- FileRec with invoiceId set and studentId null — a financial record, not
-- child data, which is what keeps it off the COPPA retention purge. FileRec's
-- row-level security policy already covers the new column (it keys on
-- schoolId, unchanged).

ALTER TABLE "FileRec" ADD COLUMN "invoiceId" TEXT;
CREATE INDEX "FileRec_invoiceId_idx" ON "FileRec"("invoiceId");
