# Compliance document templates

> ⚠️ **ATTORNEY REVIEW REQUIRED — these are engineering-authored drafts, not legal advice.**
> They exist so an edtech-privacy attorney has a starting point, not an ending point. Do **not**
> publish, sign, or rely on any of them until a qualified attorney has reviewed and adapted them to
> your entity, jurisdiction, and actual data practices. The product plan budgets $5,000–10,000 for
> this review — it is the single best money you'll spend.

These templates back the "documents to have before your first paying customer" checklist:

| File | Purpose |
|---|---|
| [WISP.md](./WISP.md) | Written Information Security Program (COPPA requires a written program with a named responsible person) |
| [RETENTION.md](./RETENTION.md) | Data retention & deletion schedule (COPPA prohibits indefinite retention) |
| [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) | Privacy policy with COPPA retention + parental-rights language |
| [DPA.md](./DPA.md) | Data Processing Agreement template + subprocessor list |

**Still to be drafted (not in this repo):** Terms of Service, Incident Response Plan, Customer
Agreement / Order Form. Draft these with the attorney too.

## How the product already supports these

- **Retention window** is configurable per school (Settings → Data retention) and enforced by a
  nightly purge job (`/api/cron/purge`, `src/lib/retention.ts`).
- **Right to deletion** is available to staff (student page) and to the verified parent (parent
  portal) — see `deleteStudentData` in `src/lib/retention.ts`.
- **Verifiable parental consent**: student logins are created only by the parent (COHORT-HANDOFF §4.2).
- **Audit log**: every consequential action is recorded and reviewable at `/audit`.
- **Unverified ESA rules stay flagged** with ⚑ until observed in a real cycle (COHORT-HANDOFF §4.5).
