# Data Retention & Deletion Schedule — TEMPLATE

> ⚠️ **ATTORNEY REVIEW REQUIRED.** Engineering-authored draft. COPPA prohibits retaining children's
> personal information longer than reasonably necessary. Confirm the specific windows below with
> counsel and with any state records-retention rules that apply to your customers.

**Entity:** [LEGAL ENTITY NAME] · **Effective date:** [DATE] · **Owner:** [NAME/TITLE]

## Principle
Child personal information is kept only as long as reasonably necessary for the educational and
reimbursement purposes it was collected for, then deleted automatically.

## Schedule

| Data category | Contains child PII | Retention window | Mechanism |
|---|---|---|---|
| Attendance | Yes | School's configured window (default **730 days**) | Nightly purge (`/api/cron/purge`) |
| Observations | Yes | Same window | Nightly purge |
| Submissions / graded work | Yes | Same window | Nightly purge |
| Work-sample files | Yes | Same window | Nightly purge |
| ESA invoices & payments | Yes (name, narrative) | Retained for reimbursement/tax audit — **[CONFIRM period, e.g. 7 years]** — then deleted | Manual/scheduled per counsel |
| Audit log | Actor IDs + actions (minimal PII) | **[CONFIRM]** | Reviewed at `/audit` |
| Sessions | No child PII | Expire after 7 days | Cookie max-age + cleanup |
| Invite / reset tokens | Email only | Expire (invite 14d, reset 2d); one-time use | Marked used on consumption |

The per-school retention window is set in **Settings → Data retention** and defaults to 730 days
(~2 school years). **Homeschool-family accounts default to 1,825 days (~5 school years)** — ESA
programs can audit a family's claims years after the fact, so a family's records are kept longer by
default; the family can shorten it in Settings like any tenant. Expense-claim receipts (`FileRec.claimId`)
sit on the same footing as invoice receipts: financial records, not child data, kept out of the
purge and removed with their claim on a right-to-deletion request.
The nightly job (`src/lib/retention.ts` → `purgeSchool`) deletes attendance,
observations, submissions, and work samples older than the window and writes an audit entry.

## Right to deletion
On a family's request, the verified parent (parent portal) or school staff (student page) can
permanently delete a child and **all** associated records — including invoices, payments, and any
login. Implemented by `deleteStudentData`; every deletion is audit-logged.

## Biometric identifiers
Per the amended COPPA rule, voiceprints/faceprints are covered biometric identifiers. **If a
voice-note feature is added, transcribe and discard the audio — do not store raw audio or build
voice identification** (COHORT-HANDOFF §4.2).
