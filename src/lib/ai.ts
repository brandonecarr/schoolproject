// AI layer. Two jobs: ESA educational-purpose narratives, and weekly parent
// reports. Both fall back to a deterministic template when no API key is set,
// so the app is always demoable. Ported from the MVP's src/ai.js.
//
// Rule that must never be relaxed (COHORT-HANDOFF §4.1): AI drafts, a human
// approves. Nothing here submits anything anywhere — these functions generate
// text and return it. That is all they may ever do.

// Sonnet tier (the original author's choice) at the current model version.
// These are short, bounded administrative texts — keep the request predictable.
const MODEL = "claude-sonnet-5";

async function callClaude(
  system: string,
  user: string,
  maxTokens = 900
): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        // Sonnet 5 runs adaptive thinking when `thinking` is omitted; disable it
        // so short narratives stay fast, cheap, and never lose the max_tokens
        // budget to reasoning.
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text: string }[] };
    return (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  } catch {
    return null;
  }
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type NarrativeResult = { text: string; source: "ai" | "template" };

type PurposeContext = {
  student: { name: string; grade: string };
  school: { name: string; state: string };
  rail: { label: string; requires: { label: string }[] } | null;
  period: { start: string; end: string };
  attendance: { status: string }[];
  assignments: { title: string; courseName: string; dueDate: string }[];
  submissions: {
    status: string;
    assignmentTitle: string;
    score: number | null;
    points: number;
    feedback: string;
  }[];
  observations: { date: string; text: string }[];
  standards?: { code: string; title: string; pct: number; mastered: boolean }[];
};

// --- ESA educational purpose narrative -------------------------------------

export async function purposeNarrative(ctx: PurposeContext): Promise<NarrativeResult> {
  const {
    student,
    school,
    rail,
    period,
    attendance,
    assignments,
    submissions,
    observations,
    standards = [],
  } = ctx;

  const facts = [
    `School: ${school.name} (${school.state})`,
    `Student: ${student.name}, grade ${student.grade}`,
    `Billing period: ${fmtDate(period.start)} – ${fmtDate(period.end)}`,
    `Days present: ${attendance.filter((a) => a.status === "present").length} of ${attendance.length} logged`,
    `Courses and assignments delivered:`,
    ...assignments.map((a) => `  - ${a.courseName}: "${a.title}" (due ${fmtDate(a.dueDate)})`),
    `Student work assessed:`,
    ...submissions
      .filter((s) => s.status === "graded")
      .map(
        (s) =>
          `  - "${s.assignmentTitle}" scored ${s.score}/${s.points}. Teacher feedback: ${s.feedback || "none recorded"}`
      ),
    `Teacher observations:`,
    ...observations.map((o) => `  - ${fmtDate(o.date)}: ${o.text}`),
    ...(standards.length
      ? [
          `Standards assessed this period (${standards.filter((s) => s.mastered).length} of ${standards.length} mastered):`,
          ...standards.map(
            (s) =>
              `  - ${s.code} ${s.title}: ${Math.round(s.pct * 100)}%${s.mastered ? " (mastered)" : ""}`
          ),
        ]
      : []),
  ].join("\n");

  const system = `You write educational purpose statements that accompany Education Savings Account reimbursement invoices for small independent schools.

Rules:
- Use ONLY the facts provided. Never invent an assignment, score, date, or observation.
- Write 120-180 words in plain administrative prose. No marketing language, no adjectives about quality.
- Structure: what instruction was delivered, what the student did, how it was assessed, what the tuition covered.
- Name specific assignments and courses from the facts.
- If standards are listed, state plainly which ones the student demonstrated — this is the clearest evidence of educational progress.
- If evidence is thin, say plainly what was delivered rather than padding.
- Output the statement only. No preamble, no headings.`;

  const user = `Program: ${rail ? rail.label : "ESA"}. Required elements: ${
    rail ? rail.requires.map((r) => r.label).join("; ") : "attendance, purpose statement, itemized amount"
  }.

FACTS:
${facts}

Write the educational purpose statement.`;

  const out = await callClaude(system, user);
  if (out) return { text: out, source: "ai" };

  // Deterministic fallback
  const present = attendance.filter((a) => a.status === "present").length;
  const gradedList = submissions.filter((s) => s.status === "graded");
  const text =
    `${student.name} was enrolled at ${school.name} for the period ${fmtDate(period.start)} through ${fmtDate(period.end)} ` +
    `and was present for ${present} of ${attendance.length} logged instructional days. ` +
    `Instruction was delivered across ${assignments.length} assignment${assignments.length === 1 ? "" : "s"}` +
    (assignments.length
      ? `, including ${assignments
          .slice(0, 3)
          .map((a) => `"${a.title}" (${a.courseName})`)
          .join(", ")}. `
      : ". ") +
    (gradedList.length
      ? `Student work was submitted and assessed, including ${gradedList
          .slice(0, 2)
          .map((s) => `"${s.assignmentTitle}" (${s.score}/${s.points})`)
          .join(" and ")}. `
      : "") +
    (observations.length ? `Instructor observation on ${fmtDate(observations[0].date)}: ${observations[0].text} ` : "") +
    (standards.length
      ? `Against the standards assessed this period, the student demonstrated mastery of ${standards.filter((s) => s.mastered).length} of ${standards.length}` +
        (standards.filter((s) => s.mastered).length
          ? `, including ${standards
              .filter((s) => s.mastered)
              .slice(0, 3)
              .map((s) => `${s.code} (${s.title})`)
              .join(", ")}. `
          : ". ")
      : "") +
    `Tuition for this period covered small-group instruction, curriculum materials, and assessment of the coursework described above.`;

  return { text, source: "template" };
}

// --- ESA expense claim purpose statement (homeschool family) ---------------

export type ClaimContext = {
  family: { name: string; state: string };
  child: { name: string; grade: string };
  rail: { label: string; requires: { label: string }[] } | null;
  claim: { title: string; vendor: string; category: string; amount: number; purchaseDate: string };
  window: { start: string; end: string };
  attendance: { status: string }[];
  observations: { date: string; text: string }[];
  submissions: { status: string; assignmentTitle: string; score: number | null; points: number }[];
  standards?: { code: string; title: string; pct: number; mastered: boolean }[];
};

/**
 * The educational-purpose statement behind a family's expense claim: what was
 * bought, for whom, how it was used in instruction, what the child did with
 * it, how progress was seen. Drafted from logged facts only — a human reads
 * and approves before anything goes to the portal. Same rules as
 * purposeNarrative: never invent, plain prose, no padding.
 */
export async function claimNarrative(ctx: ClaimContext): Promise<NarrativeResult> {
  const { family, child, rail, claim, window, attendance, observations, submissions, standards = [] } = ctx;
  const present = attendance.filter((a) => a.status === "present").length;
  const graded = submissions.filter((s) => s.status === "graded");

  const facts = [
    `Family: ${family.name} (${family.state}), homeschooling`,
    `Child: ${child.name}, grade ${child.grade}`,
    `Purchase: "${claim.title}"${claim.vendor ? ` from ${claim.vendor}` : ""}, $${claim.amount.toFixed(2)}, on ${fmtDate(claim.purchaseDate)}, category ${claim.category}`,
    `Records window: ${fmtDate(window.start)} – ${fmtDate(window.end)}`,
    `Instructional days logged in the window: ${present} present of ${attendance.length}`,
    `Parent-teacher observations in the window:`,
    ...observations.map((o) => `  - ${fmtDate(o.date)}: ${o.text}`),
    ...(graded.length
      ? [`Work assessed in the window:`, ...graded.map((s) => `  - "${s.assignmentTitle}" ${s.score}/${s.points}`)]
      : []),
    ...(standards.length
      ? [
          `Standards assessed (${standards.filter((s) => s.mastered).length} of ${standards.length} mastered):`,
          ...standards.map((s) => `  - ${s.code} ${s.title}: ${Math.round(s.pct * 100)}%${s.mastered ? " (mastered)" : ""}`),
        ]
      : []),
  ].join("\n");

  const system = `You write educational-purpose statements that accompany a homeschooling family's Education Savings Account expense reimbursement claim.

Rules:
- Use ONLY the facts provided. Never invent an activity, date, score, or observation.
- Write 90-150 words in plain administrative prose, first person plural ("we") is acceptable. No marketing language.
- Structure: what was purchased and for which child; how it was used in instruction during the records window; what the child did; how progress was seen.
- If the records are thin, say plainly what was logged rather than padding.
- Never assert that the expense is eligible or approved — that is the program's decision.
- Output the statement only. No preamble, no headings.`;

  const user = `Program: ${rail ? rail.label : "ESA"}. Required elements: ${
    rail ? rail.requires.map((r) => r.label).join("; ") : "receipt, educational purpose, the child it serves"
  }.

FACTS:
${facts}

Write the educational purpose statement.`;

  const out = await callClaude(system, user);
  if (out) return { text: out, source: "ai" };

  // Deterministic fallback
  const text =
    `We purchased "${claim.title}"${claim.vendor ? ` from ${claim.vendor}` : ""} on ${fmtDate(claim.purchaseDate)} ` +
    `for ${child.name} (grade ${child.grade}), for use in our home instruction. ` +
    `Between ${fmtDate(window.start)} and ${fmtDate(window.end)} we logged ${present} instructional day${present === 1 ? "" : "s"}` +
    (observations.length ? `, including this observation on ${fmtDate(observations[0].date)}: ${observations[0].text} ` : ". ") +
    (graded.length
      ? `Work assessed in that time included ${graded
          .slice(0, 2)
          .map((s) => `"${s.assignmentTitle}" (${s.score}/${s.points})`)
          .join(" and ")}. `
      : "") +
    (standards.length
      ? `Against the standards assessed, ${child.name} demonstrated mastery of ${standards.filter((s) => s.mastered).length} of ${standards.length}. `
      : "") +
    `The item was used for the instruction and practice described above.`;

  return { text, source: "template" };
}

// --- Progress report (period narrative for a family) -------------------------
//
// Longer and more considered than the weekly note: this is the report a parent
// keeps, and it also rides along in the printable student record. A teacher
// always reviews and approves it before a family sees it.

type ProgressContext = {
  student: { name: string; grade: string };
  school: { name: string };
  period: { start: string; end: string };
  presentDays: number;
  loggedDays: number;
  graded: { assignmentTitle: string; courseName: string; score: number | null; points: number; feedback: string }[];
  missingCount: number;
  overallPct: number | null;
  standards: { code: string; title: string; pct: number; mastered: boolean }[];
  observations: { date: string; text: string }[];
};

export async function progressNarrative(ctx: ProgressContext): Promise<NarrativeResult> {
  const {
    student,
    school,
    period,
    presentDays,
    loggedDays,
    graded,
    missingCount,
    overallPct,
    standards,
    observations,
  } = ctx;

  const masteredList = standards.filter((s) => s.mastered);
  const facts = [
    `Student: ${student.name}, grade ${student.grade}`,
    `School: ${school.name}`,
    `Reporting period: ${fmtDate(period.start)} – ${fmtDate(period.end)}`,
    `Attendance: present ${presentDays} of ${loggedDays} logged days`,
    `Overall grade on graded work: ${overallPct != null ? Math.round(overallPct * 100) + "%" : "nothing graded yet"}`,
    `Work missing (past due, not turned in): ${missingCount}`,
    `Graded work:`,
    ...graded.map(
      (g) =>
        `  - ${g.courseName}: "${g.assignmentTitle}" ${g.score}/${g.points}${g.feedback ? `. Teacher note: ${g.feedback}` : ""}`
    ),
    `Standards assessed (${masteredList.length} of ${standards.length} mastered):`,
    ...standards.map(
      (s) => `  - ${s.code} ${s.title}: ${Math.round(s.pct * 100)}%${s.mastered ? " (mastered)" : ""}`
    ),
    `Teacher observations:`,
    ...observations.map((o) => `  - ${fmtDate(o.date)}: ${o.text}`),
  ].join("\n");

  const system = `You write end-of-period progress reports from a small-school teacher to a parent.

Rules:
- Use ONLY the facts provided. Never invent a score, a skill, an event, or a feeling. If something is not in the facts, do not mention it.
- 150-220 words, three short paragraphs: how the period went overall; what specific skills and standards the child demonstrated; what to work on next.
- Warm, plain, specific. Write as the teacher ("we", "I"). No marketing language, no empty praise, no exclamation marks.
- Name real assignments and standards from the facts.
- If work is missing or a standard is not yet mastered, say so kindly and concretely rather than glossing over it.
- Do not invent next steps that the facts do not support; base them on what is incomplete or not yet mastered.
- Output the report body only. No greeting, no sign-off, no headings.`;

  const out = await callClaude(system, `FACTS:\n${facts}\n\nWrite the progress report.`, 1200);
  if (out) return { text: out, source: "ai" };

  // Deterministic fallback — same facts, no model required.
  const top = graded.slice(0, 3).map((g) => `"${g.assignmentTitle}" (${g.score}/${g.points})`);
  const text =
    `${student.name} was present for ${presentDays} of ${loggedDays} logged instructional days between ` +
    `${fmtDate(period.start)} and ${fmtDate(period.end)}. ` +
    (overallPct != null
      ? `Across ${graded.length} graded assignment${graded.length === 1 ? "" : "s"}, ${student.name.split(" ")[0]} is at ${Math.round(overallPct * 100)}%. `
      : `No work has been graded yet this period. `) +
    (top.length ? `Recent graded work includes ${top.join(", ")}. ` : "") +
    (standards.length
      ? `Against the standards assessed this period, ${student.name.split(" ")[0]} has mastered ${masteredList.length} of ${standards.length}` +
        (masteredList.length
          ? `, including ${masteredList
              .slice(0, 3)
              .map((s) => `${s.title.toLowerCase()} (${s.code})`)
              .join(", ")}. `
          : ". ") +
        (standards.length - masteredList.length > 0
          ? `${standards.length - masteredList.length} standard${standards.length - masteredList.length === 1 ? " is" : "s are"} still in progress. `
          : "")
      : "") +
    (observations.length ? `Classroom note from ${fmtDate(observations[0].date)}: ${observations[0].text} ` : "") +
    (missingCount > 0
      ? `There ${missingCount === 1 ? "is 1 assignment" : `are ${missingCount} assignments`} past due and not yet turned in — that is where we will focus next.`
      : `Nothing is outstanding at the close of this period.`);

  return { text, source: "template" };
}

// --- Weekly parent report ---------------------------------------------------

type WeeklyContext = {
  student: { name: string };
  attendance: { date: string; status: string }[];
  submissions: {
    status: string;
    assignmentTitle: string;
    score: number | null;
    points: number;
  }[];
  observations: { text: string }[];
};

export async function weeklyReport(ctx: WeeklyContext): Promise<NarrativeResult> {
  const { student, attendance, submissions, observations } = ctx;

  const facts = [
    `Student: ${student.name}`,
    `Attendance this week: ${attendance.map((a) => `${fmtDate(a.date)} ${a.status}`).join(", ") || "none logged"}`,
    `Work: ${
      submissions
        .map((s) => `"${s.assignmentTitle}" — ${s.status}${s.score != null ? ` ${s.score}/${s.points}` : ""}`)
        .join("; ") || "none"
    }`,
    `Observations: ${observations.map((o) => o.text).join(" | ") || "none"}`,
  ].join("\n");

  const system = `You write short weekly updates from a small-school teacher to a parent.

Rules:
- Use ONLY the facts given. Never invent progress, scores, or events.
- 60-100 words. Warm but not gushing. Sentence case. Write as the teacher ("we", "I").
- Mention one specific thing the child did. If work is missing, say so plainly and kindly.
- No sign-off, no subject line. Just the body.`;

  const out = await callClaude(system, `FACTS:\n${facts}\n\nWrite this week's update.`, 500);
  if (out) return { text: out, source: "ai" };

  const missing = submissions.filter((s) => s.status === "assigned");
  const done = submissions.filter((s) => s.status === "graded");
  const text =
    `Here's how ${student.name.split(" ")[0]}'s week went. ` +
    `Present ${attendance.filter((a) => a.status === "present").length} of ${attendance.length} days. ` +
    (done.length
      ? `Completed and graded: ${done.map((s) => `"${s.assignmentTitle}" (${s.score}/${s.points})`).join(", ")}. `
      : "No graded work came back this week. ") +
    (missing.length ? `Still outstanding: ${missing.map((s) => `"${s.assignmentTitle}"`).join(", ")}. ` : "") +
    (observations.length ? observations[0].text : "");

  return { text, source: "template" };
}
