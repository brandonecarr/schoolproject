# Cohort

The operations platform that gets a **microschool** paid — correctly, on time, in any state.

Teaching generates proof (roster, attendance, coursework, grading, observations, work samples),
and the proof gets the school paid: Cohort assembles state-compliant **ESA reimbursement packets**
from that same teaching data. The LMS is not a separate feature area from the invoicing — it is the
evidence engine for it.

This is the **desktop web console** (the "Operator" surface). Built as a Next.js rebuild of the
original Express MVP, on the stack the product plan calls for: **Next.js (App Router) + TypeScript +
Prisma**, deployable to Vercel.

## Run it locally

```bash
npm install
cp .env.example .env        # DATABASE_URL defaults to a local SQLite file
npx prisma migrate dev      # create the database
npm run db:seed             # seed the Cedar Grove demo school
npm run dev                 # http://localhost:3000
```

Demo accounts (all password `demo1234`):

| Role    | Email                     |
| ------- | ------------------------- |
| Teacher | `sarah@cedargrove.school` |
| Parent  | `dana@example.com`        |
| Student | `eli@cedargrove.school`   |

Set `ANTHROPIC_API_KEY` in `.env` to generate real AI narratives; without it, the app uses
deterministic templates and stays fully demoable. **AI drafts, a human approves — nothing is ever
auto-submitted to a state portal, payment rail, or parent.**

### The 5-minute tour

Dashboard → Evidence board (see **Cole Draper at 56** — the invoice that would get rejected) →
Students → open a student → attach a work sample → ESA invoices → **Build packets** → open one →
**Print / Save as PDF** → Cash flow → Tuition.

## Scripts

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | Dev server                                          |
| `npm run build`    | Production build (type-checks every route)          |
| `npm run db:seed`  | Seed the demo school (no-op if data already exists) |
| `npm run db:reset` | Drop, re-migrate, and re-seed from scratch          |

## Stack notes

- **Database** — Prisma 7 through the **libsql** driver adapter. Locally it opens the SQLite file at
  `DATABASE_URL`; it ships prebuilt binaries (no native-compile step). For Vercel, point
  `DATABASE_URL` at Turso or Postgres and switch the datasource `provider` in
  `prisma/schema.prisma` — the queries don't change (roadmap item 6.2).
- **Files** — work-sample bytes are stored in the database (`FileRec.data`), not the filesystem, so
  uploads work on Vercel's read-only serverless filesystem.
- **Auth** — session cookies + scrypt password hashing (`node:crypto`, no bcrypt). Each protected
  page/route is gated server-side via `requireUser` / `requireTeacher` / `requireRole`.

## Critical constraints (do not violate)

These are legal/liability boundaries carried over from the product handoff:

1. **AI drafts, humans approve, nothing auto-submits.** `src/lib/ai.ts` only generates text.
2. **Student accounts are created by parents, never the school** (COPPA verifiable consent) —
   `createStudentAccount` in `src/app/(portal)/actions.ts` is the only path.
3. **Never take custody of funds; never become an ESA vendor.** Cohort prepares and tracks; the
   school submits.
4. **Unverified rules stay flagged.** Everything marked `verify: true` in `src/lib/rules.ts` and the
   disbursement lags in `src/lib/billing.ts` render with a ⚑ warning. Do not remove the flags until a
   real invoice cycle has been observed — a confidently wrong rule gets a school's funding clawed
   back.
