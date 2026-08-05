# Written Information Security Program (WISP) — TEMPLATE

> ⚠️ **ATTORNEY REVIEW REQUIRED.** Engineering-authored draft. COPPA's amended rule (in active
> enforcement since April 22, 2026) requires a covered operator to maintain a written information
> security program with a named responsible person, an annual risk assessment, and tested safeguards.
> This is a starting scaffold only.

**Entity:** [LEGAL ENTITY NAME]
**Effective date:** [DATE]
**Responsible person:** [NAME, TITLE, EMAIL] — the individual accountable for this program.

## 1. Scope
Covers all systems that collect, process, or store personal information of children and families
through Cohort, including the application database, file storage, backups, and third-party
subprocessors (see [DPA.md](./DPA.md)).

## 2. Data inventory
- **Children:** name, grade, coursework, attendance, observations, work samples, guardian linkage.
- **Guardians/staff:** name, email, hashed password, session records, audit entries.
- **Financial:** tuition ledger, ESA invoice packets and narratives.
Data classification and flow diagram: [ATTACH].

## 3. Safeguards (current technical controls)
- Passwords hashed with scrypt (`node:crypto`); no plaintext storage.
- Session-cookie auth (`HttpOnly`, `SameSite=Lax`); per-request server-side authorization on every
  page, route, and mutation, scoped to the caller's school.
- Work-sample files stored in the database with access control enforced on retrieval.
- Audit log of consequential actions, reviewable at `/audit`.
- Data-retention purge job removes child records past the configured window.
- Transport encryption (TLS) in production; encryption at rest via the hosting provider.
- **[TO ADD with attorney/infra:]** MFA for admin accounts, backup encryption + tested restore,
  least-privilege access reviews, vulnerability management, secrets management.

## 4. Risk assessment
Conducted at least **annually** and after any material change. Most recent: [DATE]. Findings and
remediation tracked in [LOCATION].

## 5. Service providers
Each subprocessor is reviewed for adequate safeguards before onboarding and re-reviewed annually.
Current list: [DPA.md](./DPA.md) § Subprocessors.

## 6. Retention & deletion
Governed by [RETENTION.md](./RETENTION.md). Indefinite retention is prohibited.

## 7. Incident response
[LINK to Incident Response Plan — TO BE DRAFTED.] Includes detection, containment, notification
timelines, and post-incident review.

## 8. Training & review
Personnel with data access are trained on this program at onboarding and annually. This WISP is
reviewed at least annually by the responsible person.
