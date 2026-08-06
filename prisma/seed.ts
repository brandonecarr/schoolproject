// Demo seed — Cedar Grove Learning Collective. Ported from the MVP's src/seed.js.
//
// Produces the deliberate evidence spread the whole demo hangs on:
//   Eli 100, Maya 97, Priya 97, Jonah 81, Ivy 81, Cole Draper 56
// Cole is the "thin evidence" case — no graded work, no observations — the
// student whose invoice gets questioned. Do not "fix" his gaps; they're the point.
//
// Uses relative imports (not the @/ alias) so it runs under tsx without needing
// tsconfig path resolution.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/password";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL (or DIRECT_URL) to your Supabase database before seeding.");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const existing = await prisma.school.count();
  if (existing > 0) {
    console.log("Data already present — run `npm run db:reset` to start over.");
    return;
  }

  const school = await prisma.school.create({
    data: {
      name: "Cedar Grove Learning Collective",
      state: "AZ",
      esaAmount: 7400,
      address: "412 N Willow St, Mesa AZ",
    },
  });

  await prisma.user.create({
    data: {
      schoolId: school.id,
      role: "owner",
      name: "Sarah Whitfield",
      email: "sarah@cedargrove.school",
      password: hashPassword("demo1234"),
    },
  });

  const kids = [
    { name: "Eli Booker", grade: "4", family: "Booker", parent: "Dana Booker", pemail: "dana@example.com" },
    { name: "Maya Reyes", grade: "5", family: "Reyes", parent: "Ana Reyes", pemail: "ana@example.com" },
    { name: "Jonah Pike", grade: "3", family: "Pike", parent: "Ruth Pike", pemail: "ruth@example.com" },
    { name: "Priya Nandi", grade: "5", family: "Nandi", parent: "Vik Nandi", pemail: "vik@example.com" },
    { name: "Cole Draper", grade: "4", family: "Draper", parent: "Tess Draper", pemail: "tess@example.com" },
    { name: "Ivy Salas", grade: "2", family: "Salas", parent: "Marco Salas", pemail: "marco@example.com" },
  ];

  const students = [];
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    const s = await prisma.student.create({
      data: {
        schoolId: school.id,
        name: k.name,
        grade: k.grade,
        familyName: k.family,
        esaProgram: i < 5 ? "AZ" : null, // one family pays cash — tests the split-payer case
        esaAmount: i < 5 ? 7400 : 0,
        tuitionAnnual: 7400,
      },
    });
    students.push(s);
  }

  // Parents. The consent flag is what makes parental consent verifiable —
  // student accounts are created BY the parent, never by the school (COPPA).
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    await prisma.user.create({
      data: {
        schoolId: school.id,
        role: "parent",
        name: k.parent,
        email: k.pemail,
        password: hashPassword("demo1234"),
        studentIdsJson: JSON.stringify([students[i].id]),
        consentGivenAt: new Date().toISOString(),
      },
    });
  }

  // One student account, created by their parent.
  await prisma.user.create({
    data: {
      schoolId: school.id,
      role: "student",
      name: "Eli Booker",
      email: "eli@cedargrove.school",
      password: hashPassword("demo1234"),
      studentId: students[0].id,
      createdByParent: true,
    },
  });

  const courseData = [
    { name: "Math — Multiplication & Fractions", subject: "Mathematics" },
    { name: "Language Arts — Narrative Writing", subject: "English Language Arts" },
    { name: "Science — Desert Ecology", subject: "Science" },
  ];
  const courses = [];
  for (const c of courseData) {
    courses.push(await prisma.course.create({ data: { schoolId: school.id, ...c } }));
  }

  const assignmentData = [
    { courseId: courses[0].id, title: "Long division practice set A", instructions: "Complete problems 1–20. Show your work on each one — I want to see the steps, not just the answer.", dueDate: daysAgo(9), points: 20 },
    { courseId: courses[0].id, title: "Fractions on a number line", instructions: "Place each fraction on the number line, then explain in one sentence how you decided.", dueDate: daysAgo(3), points: 15 },
    { courseId: courses[1].id, title: "Personal narrative — first draft", instructions: "Write 300 words about a time something did not go the way you planned.", dueDate: daysAgo(6), points: 30 },
    { courseId: courses[1].id, title: "Revision: add sensory detail", instructions: "Take your draft and add three details that use a sense other than sight.", dueDate: daysAhead(2), points: 20 },
    { courseId: courses[2].id, title: "Desert food web diagram", instructions: "Draw a food web with at least eight organisms from the Sonoran Desert. Label producers and consumers.", dueDate: daysAgo(4), points: 25 },
    { courseId: courses[2].id, title: "Field observation journal", instructions: "Three entries this week. What did you notice outside that changed?", dueDate: daysAhead(4), points: 15 },
    // New assignment TYPES — show off the expanded LMS.
    {
      courseId: courses[0].id,
      title: "Fractions quick-check",
      instructions: "A short quiz. Take your time on the last one.",
      dueDate: daysAhead(1),
      points: 6,
      type: "quiz",
      configJson: JSON.stringify([
        { id: "q1", kind: "mc", prompt: "What is 3/4 + 1/4?", choices: ["1/2", "1", "4/8", "3/8"], answerIndex: 1, points: 2 },
        { id: "q2", kind: "tf", prompt: "1/2 is greater than 1/3.", answerIndex: 0, points: 1 },
        { id: "q3", kind: "short", prompt: "Explain how you know 2/4 and 1/2 are equal.", points: 3 },
      ]),
    },
    {
      courseId: courses[2].id,
      title: "Read Chapter 3: Volcanoes",
      instructions: "Read pages 40–52. Mark it complete when you finish.",
      dueDate: daysAhead(3),
      points: 10,
      type: "checkoff",
      configJson: JSON.stringify({ reflection: true }),
    },
    {
      courseId: courses[2].id,
      title: "Photograph your leaf collection",
      instructions: "Take a clear photo of your pressed leaves with the labels showing, and upload it.",
      dueDate: daysAhead(5),
      points: 20,
      type: "upload",
      configJson: "",
    },
    {
      courseId: courses[1].id,
      title: "Persuasive essay — final",
      instructions: "Turn in your final essay. You’ll be graded on the rubric below.",
      dueDate: daysAhead(6),
      points: 15,
      type: "rubric",
      configJson: JSON.stringify({
        criteria: [
          { id: "c1", label: "Ideas & focus", max: 5 },
          { id: "c2", label: "Use of evidence", max: 5 },
          { id: "c3", label: "Mechanics", max: 5 },
        ],
      }),
    },
  ];
  const assignments = [];
  for (const a of assignmentData) {
    assignments.push(await prisma.assignment.create({ data: { schoolId: school.id, ...a } }));
  }

  // A ready-made worksheet in the library, so the teacher sees one immediately.
  await prisma.worksheet.create({
    data: {
      schoolId: school.id,
      title: "Multiplication facts — 6s and 7s",
      subject: "Math",
      instructions: "Show your work. Circle your final answer.",
      itemsJson: JSON.stringify([
        { id: "w1", kind: "fill", prompt: "6 × 7 =", answer: "42", points: 1 },
        { id: "w2", kind: "fill", prompt: "7 × 8 =", answer: "56", points: 1 },
        { id: "w3", kind: "mc", prompt: "Which is 6 × 9?", choices: ["54", "56", "63", "48"], answerIndex: 0, points: 1 },
        { id: "w4", kind: "short", prompt: "Explain a trick for remembering the 6s.", points: 2 },
      ]),
    },
  });

  // Attendance: 12 school days back (weekdays only), with two realistic absences.
  let logged = 0;
  for (let d = 18; d >= 0 && logged < 12; d--) {
    const date = daysAgo(d);
    const dow = new Date(date + "T12:00:00").getDay();
    if (dow === 0 || dow === 6) continue;
    logged++;
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const absent = (i === 2 && logged === 4) || (i === 4 && logged === 9);
      await prisma.attendance.create({
        data: {
          schoolId: school.id,
          studentId: s.id,
          date,
          status: absent ? "absent" : "present",
          note: absent ? "Family called in" : "",
        },
      });
    }
  }

  // Submissions with realistic gaps — Cole (index 4) is the thin-evidence case.
  const grid: { si: number; ai: number; status: string; score?: number; feedback?: string }[] = [
    { si: 0, ai: 0, status: "graded", score: 18, feedback: "Steps are clear now. Watch the remainder on #14." },
    { si: 0, ai: 2, status: "graded", score: 26, feedback: "Strong opening. The ending stops rather than lands — try one more line." },
    { si: 0, ai: 4, status: "submitted" },
    { si: 0, ai: 3, status: "assigned" },
    { si: 1, ai: 0, status: "graded", score: 20, feedback: "All correct, and the work is legible. Nice." },
    { si: 1, ai: 1, status: "graded", score: 14, feedback: "The number line explanation is exactly the reasoning I wanted." },
    { si: 1, ai: 2, status: "graded", score: 28, feedback: "Vivid and specific. Read it aloud to catch two run-ons." },
    { si: 1, ai: 4, status: "graded", score: 24, feedback: "Eight organisms, correctly labeled. Producers section is excellent." },
    { si: 2, ai: 0, status: "graded", score: 15, feedback: "Getting there. Let's do five more together on Tuesday." },
    { si: 2, ai: 2, status: "submitted" },
    { si: 3, ai: 0, status: "graded", score: 19, feedback: "Only slip was #7. Check your carrying." },
    { si: 3, ai: 1, status: "graded", score: 15, feedback: "Perfect. Ready for mixed numbers." },
    { si: 3, ai: 4, status: "graded", score: 25, feedback: "Best food web in the group. The decomposer branch was a nice addition." },
    { si: 4, ai: 0, status: "assigned" },
    { si: 4, ai: 2, status: "assigned" },
    { si: 5, ai: 0, status: "graded", score: 17, feedback: "Good focus today." },
    { si: 5, ai: 4, status: "submitted" },
    // Give the demo student (Eli, si:0) one of each new type to try.
    { si: 0, ai: 6, status: "assigned" }, // quiz
    { si: 0, ai: 7, status: "assigned" }, // check-off
    { si: 0, ai: 8, status: "assigned" }, // upload
    { si: 0, ai: 9, status: "assigned" }, // rubric project
    { si: 1, ai: 6, status: "assigned" }, // quiz for a second student too
  ];

  for (const g of grid) {
    const a = assignments[g.ai];
    await prisma.submission.create({
      data: {
        schoolId: school.id,
        assignmentId: a.id,
        studentId: students[g.si].id,
        status: g.status,
        submittedAt: g.status === "assigned" ? null : new Date(a.dueDate + "T15:00:00").toISOString(),
        responseText: g.status === "assigned" ? "" : "Turned in on paper — photographed and attached.",
        score: g.score ?? null,
        feedback: g.feedback || "",
        gradedAt: g.status === "graded" ? new Date().toISOString() : null,
      },
    });
  }

  const obs = [
    { si: 0, text: "Eli finally held the long-division steps in his head without the reference card. Third week of trying." },
    { si: 1, text: "Maya read her narrative to the group unprompted. First time she has volunteered." },
    { si: 3, text: "Priya is ready to move to mixed numbers — she is finishing the fraction set in half the time." },
    { si: 2, text: "Jonah needs the multiplication table in front of him still. Not a concern yet, but tracking it." },
    { si: 5, text: "Ivy sorted the desert animals by habitat without being asked to categorize at all." },
  ];
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    await prisma.observation.create({
      data: {
        schoolId: school.id,
        studentId: students[o.si].id,
        date: daysAgo(i + 1),
        text: o.text,
        author: "Sarah Whitfield",
      },
    });
  }

  console.log("Seeded Cedar Grove Learning Collective.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
