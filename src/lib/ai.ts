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
};

// --- ESA educational purpose narrative -------------------------------------

export async function purposeNarrative(ctx: PurposeContext): Promise<NarrativeResult> {
  const { student, school, rail, period, attendance, assignments, submissions, observations } = ctx;

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
  ].join("\n");

  const system = `You write educational purpose statements that accompany Education Savings Account reimbursement invoices for small independent schools.

Rules:
- Use ONLY the facts provided. Never invent an assignment, score, date, or observation.
- Write 120-180 words in plain administrative prose. No marketing language, no adjectives about quality.
- Structure: what instruction was delivered, what the student did, how it was assessed, what the tuition covered.
- Name specific assignments and courses from the facts.
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
    `Tuition for this period covered small-group instruction, curriculum materials, and assessment of the coursework described above.`;

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
