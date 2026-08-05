# Data Processing Agreement (DPA) — TEMPLATE

> ⚠️ **ATTORNEY REVIEW REQUIRED.** Engineering-authored draft. Schools will ask for a DPA; having a
> reviewed one ready signals seriousness. Do not execute this without counsel.

This DPA is between **[LEGAL ENTITY NAME]** ("Processor") and the **School** ("Controller") and
supplements the Customer Agreement. Effective on the Customer Agreement date.

## 1. Roles
The School is the controller of student and family personal data. The Processor processes that data
solely on the School's documented instructions to provide Cohort.

## 2. Scope & purpose
Processing is limited to operating the service: roster/coursework management, ESA invoice
preparation, and reimbursement tracking. **No selling of data; no advertising or non-educational
profiling.**

## 3. Confidentiality & security
The Processor maintains the safeguards described in its WISP ([WISP.md](./WISP.md)) and restricts
access to personnel with a need to know, bound by confidentiality.

## 4. Subprocessors
The Processor may engage the subprocessors listed below, each under a written contract with
equivalent protections, and will give the School notice of changes.

| Subprocessor | Purpose | Data |
|---|---|---|
| [Hosting provider — e.g. Vercel] | Application hosting | App traffic, logs |
| [Database provider — e.g. Turso / Postgres host] | Primary data store | All application data |
| [Anthropic] | AI narrative drafting (optional; only when an API key is configured) | The specific teaching facts sent to draft one narrative |
| [Stripe — when payments ship] | Payment processing (platform model) | Payment/tuition data |

> Note: AI narrative generation is **optional** and off unless an API key is set; when on, only the
> facts needed to draft a single educational-purpose statement are sent, and nothing is auto-submitted.

## 5. Retention & deletion
Per [RETENTION.md](./RETENTION.md). On termination or the School's request, the Processor deletes or
returns personal data within [N] days, subject to legal retention requirements.

## 6. Data subject requests
The Processor assists the School in responding to access, correction, and deletion requests; the
parent portal and staff tools enable these directly.

## 7. Breach notification
The Processor notifies the School without undue delay after becoming aware of a personal-data breach,
per the Incident Response Plan.

## 8. Audits
The Processor makes available information reasonably necessary to demonstrate compliance.

## 9. FERPA (when applicable)
When the School is FERPA-covered (e.g. public/charter), the Processor acts under the School Official
Exception and processes education records only as directed.

Signatures: [SCHOOL] ___________  [PROCESSOR] ___________
