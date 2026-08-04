// Integration smoke test: boots against the real seeded database and asserts the
// evidence scoring reproduces the deliberate demo spread (Cole Draper at 56 is
// the invoice-would-be-rejected case). This is the end-to-end guard that the DB
// layer + domain logic still agree. Run with `npm run smoke` (needs a seeded db).
//
// Relative imports (not the @/ alias) so it runs under tsx without tsconfig paths.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { scoreEvidence } from "../src/lib/rules";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const adapter = new PrismaLibSql(authToken ? { url, authToken } : { url });
const prisma = new PrismaClient({ adapter });

function periodStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

const EXPECTED: Record<string, number> = {
  "Eli Booker": 97,
  "Maya Reyes": 97,
  "Jonah Pike": 81,
  "Priya Nandi": 97,
  "Cole Draper": 56,
  "Ivy Salas": 81,
};

async function main() {
  const start = periodStart();
  const end = new Date().toISOString().slice(0, 10);
  const inRange = (d: string) => d >= start && d <= end;

  const students = await prisma.student.findMany({ orderBy: { createdAt: "asc" } });
  if (students.length === 0) {
    console.error("✗ No students found — run `npm run db:seed` first.");
    process.exit(1);
  }

  const failures: string[] = [];
  for (const s of students) {
    const attendance = (await prisma.attendance.findMany({ where: { studentId: s.id } })).filter((a) =>
      inRange(a.date)
    );
    const submissions = await prisma.submission.findMany({ where: { studentId: s.id } });
    const observations = (await prisma.observation.findMany({ where: { studentId: s.id } })).filter((o) =>
      inRange(o.date)
    );
    const assignmentIds = [...new Set(submissions.map((x) => x.assignmentId))];
    const assignments = assignmentIds.length
      ? await prisma.assignment.findMany({ where: { id: { in: assignmentIds } } })
      : [];
    const samples = (await prisma.fileRec.findMany({ where: { studentId: s.id } })).filter((f) =>
      inRange((f.capturedAt || "").slice(0, 10))
    );

    const { score } = scoreEvidence({ attendance, submissions, observations, assignments, samples });
    const want = EXPECTED[s.name];
    const ok = want === undefined ? true : score === want;
    console.log(`${ok ? "✓" : "✗"} ${String(score).padStart(3)}  ${s.name}${want !== undefined && !ok ? ` (expected ${want})` : ""}`);
    if (!ok) failures.push(`${s.name}: got ${score}, expected ${want}`);
  }

  if (failures.length) {
    console.error(`\n✗ Smoke test failed:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log("\n✓ Evidence spread matches the seeded demo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
