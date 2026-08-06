// GET /records/[id]/print?start=&end= — one student's complete educational
// record as a standalone printable document (Save as PDF).
//
// This is the artifact a founder hands to a state reviewer and a parent keeps
// for their own files: attendance, coursework and grades, standards mastery,
// instructor observations, and photographed work samples in one place.
//
// A route handler (not a page) so it bypasses the console shell, matching the
// invoice packet and worksheet print. Access: school staff, the child's parent,
// or the student themselves. Nothing is transmitted anywhere — the user prints.

import { NextResponse } from "next/server";
import { getSession, logAudit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { masteryForStudent } from "@/lib/mastery";
import { PROGRAMS } from "@/lib/rules";
import { letterFor } from "@/lib/gradebook";
import { fmt, periodStart, today } from "@/lib/dates";
import { STATUS_META } from "@/lib/outcomes";

export const dynamic = "force-dynamic";

const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const { user, school } = session;
  const { id } = await params;

  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) return new Response("Student not found.", { status: 404 });

  // Access: staff at this school, the child's parent, or the student.
  const isStaff = ["owner", "teacher"].includes(user.role) && user.schoolId === student.schoolId;
  let isFamily = false;
  if (user.role === "parent") {
    const ids: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
    isFamily = ids.includes(id);
  } else if (user.role === "student") {
    isFamily = user.studentId === id;
  }
  if (!isStaff && !isFamily) return new Response("Not available for this account.", { status: 403 });

  const url = new URL(req.url);
  const start = url.searchParams.get("start") || periodStart();
  const end = url.searchParams.get("end") || today();

  const [e, mastery, courses, report] = await Promise.all([
    evidenceFor(id, start, end),
    masteryForStudent(id, student.schoolId, { start, end }),
    prisma.course.findMany({ where: { schoolId: student.schoolId } }),
    // Only an approved narrative belongs in a record that leaves the building.
    prisma.progressReport.findFirst({
      where: { studentId: id, status: "approved" },
      orderBy: { periodEnd: "desc" },
    }),
  ]);
  const schoolRow = school ?? (await prisma.school.findUnique({ where: { id: student.schoolId } }));

  // Grade summary over graded work in the window.
  const graded = e.submissions.filter((s) => s.status === "graded" && s.score != null);
  const earned = graded.reduce((n, s) => n + (s.score ?? 0), 0);
  const possible = graded.reduce((n, s) => n + s.points, 0);
  const pct = possible > 0 ? earned / possible : null;
  const missing = e.submissions.filter(
    (s) => (s.status === "assigned" || s.status === "draft") && (s.dueDate ?? "") < today()
  ).length;

  const assessed = mastery.rollups.filter((r) => r.status !== "none");
  const masteredCount = assessed.filter((r) => r.mastered).length;
  const outcomeOf = (oid: string) => mastery.outcomes.find((o) => o.id === oid);
  void courses;

  const css = `
  *{box-sizing:border-box}
  body{margin:0;padding:44px;font-family:ui-serif,Georgia,"Times New Roman",serif;color:#141C26;font-size:11.5pt;line-height:1.5;background:#fff;max-width:860px}
  h1{font-size:22pt;margin:0 0 2px}
  h2{font-size:10.5pt;text-transform:uppercase;letter-spacing:.14em;margin:26px 0 8px;color:#5C6672;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
  .head{border-bottom:2px solid #141C26;padding-bottom:14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
  .meta{font-family:-apple-system,sans-serif;font-size:9.5pt;color:#5C6672;text-align:right;line-height:1.7}
  .sub{font-family:-apple-system,sans-serif;font-size:10pt;color:#5C6672}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  th{text-align:left;font-family:-apple-system,sans-serif;font-size:8.5pt;letter-spacing:.08em;text-transform:uppercase;color:#5C6672;padding:0 8px 6px;border-bottom:1px solid #DCDFD8}
  td{padding:6px 8px;border-bottom:1px solid #EDEFE9;font-size:10.5pt;vertical-align:top}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .cards{display:flex;gap:12px;margin-top:8px;flex-wrap:wrap}
  .kpi{border:1px solid #DCDFD8;border-radius:8px;padding:10px 16px;min-width:118px}
  .kpi .n{font-size:19pt;font-weight:600;line-height:1.1}
  .kpi .l{font-family:-apple-system,sans-serif;font-size:8.5pt;color:#5C6672;text-transform:uppercase;letter-spacing:.07em;margin-top:3px}
  .tag{display:inline-block;border-radius:4px;padding:1px 7px;font-family:-apple-system,sans-serif;font-size:8.5pt}
  .m{background:#E8F2B8;color:#3F4A0C}
  .n{background:#F7EEDC;color:#8A5C0C}
  .d{background:#F6E4E1;color:#8A2E20}
  .narrative{border-left:3px solid #141C26;padding:2px 0 2px 16px;margin:6px 0 0;white-space:pre-wrap}
  .samples{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
  .samples figure{margin:0;width:168px}
  .samples img{width:100%;border:1px solid #DCDFD8;border-radius:4px}
  .samples figcaption{font-family:-apple-system,sans-serif;font-size:8.5pt;color:#5C6672;margin-top:4px}
  .foot{margin-top:32px;padding-top:12px;border-top:1px solid #DCDFD8;font-family:-apple-system,sans-serif;font-size:8.5pt;color:#5C6672}
  .bar{position:fixed;top:0;left:0;right:0;background:#1F3A6E;color:#fff;padding:10px 18px;font-family:-apple-system,sans-serif;font-size:13px;display:flex;gap:14px;align-items:center;justify-content:space-between}
  .bar a,.bar button{font:inherit;padding:6px 14px;border-radius:7px;border:0;cursor:pointer;text-decoration:none}
  .bar button{background:#C8E64B;color:#2F3908;font-weight:700}
  .bar a{background:rgba(255,255,255,.15);color:#fff}
  body{padding-top:96px}
  @media print{.bar{display:none}body{padding:0}@page{margin:16mm}}
  `;

  const gradeRows =
    e.submissions
      .slice()
      .sort((a, b) => ((a.dueDate ?? "") < (b.dueDate ?? "") ? -1 : 1))
      .map(
        (s) => `<tr>
      <td>${esc(s.courseName)}</td>
      <td>${esc(s.assignmentTitle)}</td>
      <td>${esc(fmt(s.dueDate))}</td>
      <td class="num">${s.status === "graded" && s.score != null ? `${s.score}/${s.points}` : esc(s.status)}</td>
      <td>${esc(s.feedback || "")}</td>
    </tr>`
      )
      .join("") || `<tr><td colspan="5">No coursework recorded in this period.</td></tr>`;

  const masteryRows = assessed.length
    ? assessed
        .map((r) => {
          const o = outcomeOf(r.outcomeId);
          const cls = r.status === "mastered" ? "m" : r.status === "near" ? "n" : "d";
          return `<tr>
        <td>${esc(o?.subject || "")}</td>
        <td>${esc(o?.code || "")}</td>
        <td>${esc(o?.title || "")}</td>
        <td class="num">${r.pct != null ? Math.round(r.pct * 100) + "%" : "—"}</td>
        <td><span class="tag ${cls}">${esc(STATUS_META[r.status].label)}</span></td>
      </tr>`;
        })
        .join("")
    : "";

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Record — ${esc(student.name)}</title><style>${css}</style></head><body>
  <div class="bar">
    <span>Student record · ${esc(fmt(start))} – ${esc(fmt(end))} · Save as PDF for your files or a state submission.</span>
    <span>
      <a href="${isStaff ? "/reports" : "/parent/children"}">Back</a>
      <button onclick="window.print()">Print / Save as PDF</button>
    </span>
  </div>

  <div class="head">
    <div>
      <h1>${esc(student.name)}</h1>
      <div class="sub">Grade ${esc(student.grade)} &middot; ${esc(
        student.esaProgram ? PROGRAMS[student.esaProgram]?.label ?? student.esaProgram : "Private pay"
      )}</div>
    </div>
    <div class="meta">
      <strong style="color:#141C26">${esc(schoolRow?.name ?? "")}</strong><br>
      ${esc(schoolRow?.address || "")}<br>
      Reporting period ${esc(fmt(start))} – ${esc(fmt(end))}<br>
      Prepared ${esc(fmt(today()))}
    </div>
  </div>

  <div class="cards">
    <div class="kpi"><div class="n">${e.presentDays}/${e.attendance.length}</div><div class="l">Days present</div></div>
    <div class="kpi"><div class="n">${pct != null ? Math.round(pct * 100) + "%" : "—"}</div><div class="l">Overall grade</div></div>
    <div class="kpi"><div class="n">${letterFor(pct)}</div><div class="l">Letter</div></div>
    <div class="kpi"><div class="n">${masteredCount}/${assessed.length || 0}</div><div class="l">Standards mastered</div></div>
    <div class="kpi"><div class="n">${missing}</div><div class="l">Missing work</div></div>
  </div>

  ${
    report
      ? `<h2>Instructor summary</h2>
  <p class="narrative">${esc(report.narrative)}</p>
  <p class="sub" style="margin:6px 0 0">${esc(report.createdByName)}${
    report.approvedByName && report.approvedByName !== report.createdByName
      ? `, approved by ${esc(report.approvedByName)}`
      : ""
  }${report.approvedAt ? ` &middot; ${esc(fmt(report.approvedAt.slice(0, 10)))}` : ""} &middot; covering ${esc(
    fmt(report.periodStart)
  )} – ${esc(fmt(report.periodEnd))}</p>`
      : ""
  }

  <h2>Attendance</h2>
  <p style="margin:0">Present <strong>${e.presentDays}</strong> of <strong>${e.attendance.length}</strong> logged instructional days during the reporting period.</p>

  <h2>Coursework and assessment</h2>
  <table><thead><tr><th>Course</th><th>Assignment</th><th style="width:78px">Due</th><th style="width:80px" class="num">Score</th><th>Instructor feedback</th></tr></thead>
  <tbody>${gradeRows}</tbody></table>
  ${
    possible > 0
      ? `<p class="sub" style="margin:8px 0 0">Overall: <strong>${earned}/${possible}</strong> (${Math.round(
          (pct ?? 0) * 100
        )}%, ${letterFor(pct)}) across ${graded.length} graded item${graded.length === 1 ? "" : "s"}. Percentages reflect graded work only.</p>`
      : ""
  }

  ${
    masteryRows
      ? `<h2>Standards demonstrated</h2>
  <p style="margin:0 0 6px">Mastered <strong>${masteredCount}</strong> of <strong>${assessed.length}</strong> standards assessed this period.</p>
  <table><thead><tr><th style="width:90px">Subject</th><th style="width:92px">Standard</th><th>Skill</th><th style="width:60px" class="num">Level</th><th style="width:110px">Status</th></tr></thead>
  <tbody>${masteryRows}</tbody></table>`
      : ""
  }

  ${
    e.observations.length
      ? `<h2>Instructor observations</h2><table><tbody>${e.observations
          .map(
            (o) =>
              `<tr><td style="width:88px">${esc(fmt(o.date))}</td><td>${esc(o.text)}</td></tr>`
          )
          .join("")}</tbody></table>`
      : ""
  }

  ${
    e.samples.length
      ? `<h2>Student work samples</h2><div class="samples">${e.samples
          .map((f) =>
            f.mime === "application/pdf"
              ? `<figure><div style="border:1px solid #DCDFD8;border-radius:4px;padding:24px;text-align:center;font-family:sans-serif;font-size:9pt;color:#5C6672">PDF attachment</div><figcaption>${esc(f.label)}</figcaption></figure>`
              : `<figure><img src="/files/${esc(f.id)}" alt="${esc(f.label)}"><figcaption>${esc(f.label)}</figcaption></figure>`
          )
          .join("")}</div>`
      : ""
  }

  <div class="foot">
    Prepared by ${esc(user.name)} on ${esc(fmt(today()))} from attendance, coursework, assessment, and
    observation records maintained contemporaneously in Cohort. Grade percentages count graded work
    only; work not yet assessed is excluded rather than counted as zero, and missing work is reported
    separately above.
  </div>
  </body></html>`;

  await logAudit(user.id, "student_record_printed", `${student.name} (${start}..${end})`);
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
