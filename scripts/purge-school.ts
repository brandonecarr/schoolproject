// Delete one school and everything attached to it: `npm run purge:school`
//
// The demo data is genuinely useful right now — it is the only content in the
// app, and deleting it would leave nothing to look at or verify against. So
// this is not run automatically anywhere. It exists so that when a real school
// onboards, clearing Cedar Grove is one command rather than an afternoon of
// hand-written DELETEs that misses two tables.
//
// Refuses to run without --yes, and prints exactly what it is about to destroy
// first. There is no undo.
//
//   npm run purge:school                      list schools
//   npm run purge:school -- <schoolId>        dry run, shows the counts
//   npm run purge:school -- <schoolId> --yes  actually delete

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL (or DIRECT_URL) first.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const args = process.argv.slice(2);
  const schoolId = args.find((a) => !a.startsWith("-"));
  const confirmed = args.includes("--yes");

  if (!schoolId) {
    const schools = await prisma.school.findMany({ select: { id: true, name: true, state: true } });
    console.log("Schools:\n");
    for (const s of schools) console.log(`  ${s.id}  ${s.name} (${s.state})`);
    console.log("\nRun again with a school id to see what would be deleted.");
    return;
  }

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    console.log(`No school with id ${schoolId}.`);
    return;
  }

  // Students are needed up front: several tables key off studentId rather than
  // schoolId, and those are exactly the ones a hand-written purge forgets.
  const students = await prisma.student.findMany({ where: { schoolId }, select: { id: true } });
  const studentIds = students.map((s) => s.id);
  const users = await prisma.user.findMany({ where: { schoolId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const submissions = await prisma.submission.findMany({ where: { schoolId }, select: { id: true } });
  const submissionIds = submissions.map((s) => s.id);
  const announcements = await prisma.announcement.findMany({ where: { schoolId }, select: { id: true } });

  const counts: Record<string, number> = {
    students: studentIds.length,
    users: userIds.length,
    submissions: submissionIds.length,
    attendance: await prisma.attendance.count({ where: { schoolId } }),
    observations: await prisma.observation.count({ where: { schoolId } }),
    files: await prisma.fileRec.count({ where: { schoolId } }),
    invoices: await prisma.invoice.count({ where: { schoolId } }),
    messages: await prisma.message.count({ where: { schoolId } }),
    announcements: announcements.length,
    calendarEvents: await prisma.calendarEvent.count({ where: { schoolId } }),
    annotations: await prisma.annotation.count({ where: { schoolId } }),
    portfolioEntries: await prisma.portfolioEntry.count({ where: { schoolId } }),
    railObservations: await prisma.railObservation.count({ where: { schoolId } }),
  };

  console.log(`\n${school.name} (${school.state})  ${school.id}\n`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${String(v).padStart(5)}  ${k}`);

  if (!confirmed) {
    console.log("\nDry run. Add --yes to delete all of the above. There is no undo.");
    return;
  }

  // Order matters only where a row would be orphaned rather than removed; the
  // child tables that key off student/submission/user go first.
  await prisma.$transaction([
    prisma.announcementAck.deleteMany({ where: { announcementId: { in: announcements.map((a) => a.id) } } }),
    prisma.announcement.deleteMany({ where: { schoolId } }),
    prisma.annotation.deleteMany({ where: { schoolId } }),
    prisma.portfolioEntry.deleteMany({ where: { schoolId } }),
    prisma.moduleProgress.deleteMany({ where: { schoolId } }),
    prisma.outcomeResult.deleteMany({ where: { schoolId } }),
    prisma.outcomeAlignment.deleteMany({ where: { schoolId } }),
    prisma.gradeChange.deleteMany({ where: { submissionId: { in: submissionIds } } }),
    prisma.progressReport.deleteMany({ where: { schoolId } }),
    prisma.notification.deleteMany({ where: { schoolId } }),
    prisma.railObservation.deleteMany({ where: { schoolId } }),
    prisma.submission.deleteMany({ where: { schoolId } }),
    prisma.attendance.deleteMany({ where: { schoolId } }),
    prisma.observation.deleteMany({ where: { schoolId } }),
    prisma.fileRec.deleteMany({ where: { schoolId } }),
    prisma.payment.deleteMany({ where: { schoolId } }),
    prisma.invoice.deleteMany({ where: { schoolId } }),
    prisma.message.deleteMany({ where: { schoolId } }),
    prisma.calendarEvent.deleteMany({ where: { schoolId } }),
    prisma.pathRule.deleteMany({ where: { schoolId } }),
    prisma.moduleItem.deleteMany({ where: { schoolId } }),
    prisma.module.deleteMany({ where: { schoolId } }),
    prisma.page.deleteMany({ where: { schoolId } }),
    prisma.itemBank.deleteMany({ where: { schoolId } }),
    prisma.worksheet.deleteMany({ where: { schoolId } }),
    prisma.assignment.deleteMany({ where: { schoolId } }),
    prisma.outcome.deleteMany({ where: { schoolId } }),
    prisma.course.deleteMany({ where: { schoolId } }),
    prisma.student.deleteMany({ where: { schoolId } }),
    prisma.token.deleteMany({ where: { schoolId } }),
    prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { schoolId } }),
    prisma.school.delete({ where: { id: schoolId } }),
  ]);

  // The audit log deliberately survives: it records who did what, and wiping it
  // alongside the data it describes would defeat the point of keeping one.
  console.log(`\nDeleted ${school.name}. The audit log was left intact on purpose.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
