// Run the data-retention purge locally: `npm run purge`.
// (In production the same logic runs via GET /api/cron/purge on a schedule.)
// Relative imports so it runs under tsx without tsconfig path resolution.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const prisma = new PrismaClient({ adapter: new PrismaLibSql(authToken ? { url, authToken } : { url }) });

async function main() {
  const schools = await prisma.school.findMany({ select: { id: true, name: true, retentionDays: true } });
  let total = 0;
  for (const s of schools) {
    const ms = s.retentionDays * 86_400_000;
    const cutoff = new Date(Date.now() - ms);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const cutoffIso = cutoff.toISOString();
    const [att, obs, sub, fil] = await prisma.$transaction([
      prisma.attendance.deleteMany({ where: { schoolId: s.id, date: { lt: cutoffDate } } }),
      prisma.observation.deleteMany({ where: { schoolId: s.id, date: { lt: cutoffDate } } }),
      prisma.submission.deleteMany({ where: { schoolId: s.id, createdAt: { lt: cutoff } } }),
      prisma.fileRec.deleteMany({ where: { schoolId: s.id, capturedAt: { lt: cutoffIso } } }),
    ]);
    const n = att.count + obs.count + sub.count + fil.count;
    total += n;
    console.log(`${s.name}: purged ${n} records older than ${cutoffDate} (retain ${s.retentionDays}d)`);
  }
  console.log(`Done — ${total} record(s) purged across ${schools.length} school(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
