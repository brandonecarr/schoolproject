// GET /invoices/[id]/print — the printable ESA packet as a standalone HTML
// document. A route handler (not a page) so it bypasses the console shell.
// Ported from server.js. Nothing is transmitted; the founder saves as PDF and
// uploads to the state portal themselves.

import { NextResponse } from "next/server";
import { getSession, logAudit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { RAILS } from "@/lib/rules";
import { fmt, today } from "@/lib/dates";

export const dynamic = "force-dynamic";

const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !["owner", "teacher"].includes(session.user.role)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const { user, school, rail: sessionRail } = session;
  const { id } = await params;

  const inv = await prisma.invoice.findFirst({ where: { id, schoolId: school!.id } });
  if (!inv) return new Response("Invoice not found.", { status: 404 });

  const s = await prisma.student.findUnique({ where: { id: inv.studentId } });
  const rail = (inv.railId ? RAILS[inv.railId] : null) ?? sessionRail;
  const e = await evidenceFor(inv.studentId, inv.periodStart, inv.periodEnd);
  const graded = e.submissions.filter((x) => x.status === "graded");

  const printCss = `
  *{box-sizing:border-box}
  body{margin:0;padding:44px;font-family:ui-serif,Georgia,"Times New Roman",serif;color:#141C26;font-size:12pt;line-height:1.55;background:#fff;max-width:840px}
  h1{font-size:20pt;margin:0 0 2px}
  h2{font-size:11pt;text-transform:uppercase;letter-spacing:.14em;margin:26px 0 8px;color:#5C6672;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
  .head{border-bottom:2px solid #141C26;padding-bottom:14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
  .meta{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:10pt;color:#5C6672;text-align:right;line-height:1.7}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  th{text-align:left;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:8.5pt;letter-spacing:.1em;text-transform:uppercase;color:#5C6672;padding:0 8px 6px;border-bottom:1px solid #DCDFD8}
  td{padding:7px 8px;border-bottom:1px solid #EDEFE9;font-size:11pt}
  .narrative{border-left:3px solid #141C26;padding:2px 0 2px 16px;margin:6px 0 0}
  .samples{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
  .samples figure{margin:0;width:170px}
  .samples img{width:100%;border:1px solid #DCDFD8;border-radius:4px}
  .samples figcaption{font-family:-apple-system,sans-serif;font-size:8.5pt;color:#5C6672;margin-top:4px}
  .foot{margin-top:34px;padding-top:12px;border-top:1px solid #DCDFD8;font-family:-apple-system,sans-serif;font-size:9pt;color:#5C6672}
  .bar{position:fixed;top:0;left:0;right:0;background:#1F3A6E;color:#fff;padding:10px 18px;font-family:-apple-system,sans-serif;font-size:13px;display:flex;gap:14px;align-items:center;justify-content:space-between}
  .bar button,.bar a{font:inherit;padding:6px 14px;border-radius:7px;border:0;cursor:pointer;text-decoration:none}
  .bar button{background:#C8E64B;color:#2F3908;font-weight:700}
  .bar a{background:rgba(255,255,255,.15);color:#fff}
  body{padding-top:96px}
  @media print{.bar{display:none}body{padding:0}@page{margin:18mm}}
  `;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ESA packet — ${esc(s ? s.name : "")}</title><style>${printCss}</style></head><body>
  <div class="bar">
    <span>Save as PDF, then upload it to ${esc(rail ? rail.label : "your state portal")}. Nothing is sent from here.</span>
    <span><a href="/invoices/${esc(inv.id)}">Back</a> <button onclick="window.print()">Print / Save as PDF</button></span>
  </div>

  <div class="head">
    <div>
      <h1>${esc(s ? s.name : "—")}</h1>
      <div style="font-family:-apple-system,sans-serif;font-size:10pt;color:#5C6672">Grade ${esc(s ? s.grade : "")} &middot; ${esc(rail ? rail.label : "")} reimbursement packet</div>
    </div>
    <div class="meta">
      <strong style="color:#141C26">${esc(school!.name)}</strong><br>
      ${esc(school!.address || "")}<br>
      Service period ${esc(fmt(inv.periodStart))} – ${esc(fmt(inv.periodEnd))}<br>
      Amount claimed: <strong style="color:#141C26">$${Number(inv.amount).toLocaleString()}</strong>
    </div>
  </div>

  <h2>Educational purpose statement</h2>
  <p class="narrative">${esc(inv.narrative)}</p>

  <h2>Attendance summary</h2>
  <p style="margin:0">Present <strong>${e.presentDays}</strong> of <strong>${e.attendance.length}</strong> logged instructional days during the service period.</p>

  ${
    e.standards.length
      ? `<h2>Standards demonstrated</h2>
  <p style="margin:0 0 4px">Mastered <strong>${e.standardsMastered}</strong> of <strong>${e.standards.length}</strong> standards assessed during the service period.</p>
  <table><thead><tr><th style="width:110px">Standard</th><th>Skill demonstrated</th><th style="width:90px">Level</th></tr></thead><tbody>
  ${e.standards
    .map(
      (st) =>
        `<tr><td>${esc(st.code)}</td><td>${esc(st.title)}</td><td>${Math.round(st.pct * 100)}%${st.mastered ? " · mastered" : ""}</td></tr>`
    )
    .join("")}
  </tbody></table>`
      : ""
  }

  <h2>Instruction delivered</h2>
  <table><thead><tr><th>Course</th><th>Assignment</th><th style="width:90px">Due</th></tr></thead><tbody>
  ${
    e.assignments.map((a) => `<tr><td>${esc(a.courseName)}</td><td>${esc(a.title)}</td><td>${esc(fmt(a.dueDate))}</td></tr>`).join("") ||
    `<tr><td colspan="3">None recorded in this period.</td></tr>`
  }
  </tbody></table>

  <h2>Work assessed</h2>
  <table><thead><tr><th>Assignment</th><th style="width:70px">Score</th><th>Instructor feedback</th></tr></thead><tbody>
  ${
    graded.map((x) => `<tr><td>${esc(x.assignmentTitle)}</td><td>${x.score}/${x.points}</td><td>${esc(x.feedback || "—")}</td></tr>`).join("") ||
    `<tr><td colspan="3">None recorded in this period.</td></tr>`
  }
  </tbody></table>

  ${
    e.observations.length
      ? `<h2>Instructor observations</h2><table><tbody>${e.observations.map((o) => `<tr><td style="width:90px">${esc(fmt(o.date))}</td><td>${esc(o.text)}</td></tr>`).join("")}</tbody></table>`
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
    Prepared by ${esc(user.name)} on ${esc(fmt(today()))} from attendance, coursework, and assessment records maintained contemporaneously in Cohort.
    ${rail && rail.verify ? "<br>Format requirements for this program have not been verified against a live submission." : ""}
  </div>
  </body></html>`;

  await logAudit(user.id, "packet_printed", inv.id);
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
