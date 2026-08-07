// GET /invoices/[id]/print — the printable ESA packet as a standalone HTML
// document. A route handler (not a page) so it bypasses the console shell.
// Ported from server.js. Nothing is transmitted; the founder saves as PDF and
// uploads to the state portal themselves.

import { NextResponse } from "next/server";
import { getSession, logAudit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { packetCss, letterhead, packetFoot, printBar } from "@/lib/packet";
import { brandForSchool } from "@/lib/packet-read";
import { evidenceFor } from "@/lib/evidence";
import { RAILS } from "@/lib/rules";
import { verificationCounts, railVerification } from "@/lib/observe";
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
  const railV = rail ? railVerification(await verificationCounts(school!.id), rail.id) : null;
  const e = await evidenceFor(inv.studentId, inv.periodStart, inv.periodEnd);
  const graded = e.submissions.filter((x) => x.status === "graded");

  // Teacher's inline marks on the work in this period. A reviewer asking for
  // "evidence of instruction delivered" is asking for exactly this: the child's
  // work with the teacher's specific corrections on it, not just a score.
  const pinRows = e.submissions.length
    ? await prisma.annotation.findMany({
        where: { submissionId: { in: e.submissions.map((x) => x.id) } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const pinsByFile = new Map<string, typeof pinRows>();
  for (const p of pinRows) {
    const list = pinsByFile.get(p.fileId) ?? [];
    list.push(p);
    pinsByFile.set(p.fileId, list);
  }

  const brand = await brandForSchool(school!.id);
  const printCss = `${packetCss(brand)}
  .samples{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
  .samples figure{margin:0;width:170px}
  .samples img{width:100%;border:1px solid #DCDFD8;border-radius:4px}
  .samples figcaption{font-family:-apple-system,sans-serif;font-size:8.5pt;color:#5C6672;margin-top:4px}
  `;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ESA packet — ${esc(s ? s.name : "")}</title><style>${printCss}</style></head><body>
  ${printBar(
    `Save as PDF, then upload it to ${rail ? rail.label : "your state portal"}. Nothing is sent from here.`,
    `/invoices/${inv.id}`
  )}

  ${letterhead(brand)}

  <div class="head">
    <div>
      <h1>${esc(s ? s.name : "—")}</h1>
      <div style="font-family:-apple-system,sans-serif;font-size:10pt;color:#5C6672">Grade ${esc(s ? s.grade : "")} &middot; ${esc(rail ? rail.label : "")} reimbursement packet</div>
    </div>
    <div class="meta">
      Service period ${esc(fmt(inv.periodStart))} – ${esc(fmt(inv.periodEnd))}<br>
      Amount claimed: <strong style="color:#141C26">$${Number(inv.amount).toLocaleString()}</strong>
    </div>
  </div>

  <h2>Educational purpose statement</h2>
  <p class="narrative">${esc(inv.narrative)}</p>

  <h2>Attendance summary</h2>
  <p style="margin:0">${
    e.instructionalDays != null
      ? `Present <strong>${e.presentDays}</strong> of <strong>${e.instructionalDays}</strong> instructional days in the service period, per the school's published calendar.`
      : `Present <strong>${e.presentDays}</strong> of <strong>${e.attendance.length}</strong> logged days during the service period.`
  }</p>

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
              : `<figure><img src="/files/${esc(f.id)}" alt="${esc(f.label)}"><figcaption>${esc(f.label)}${
                  // A numbered key rather than an overlay: pin positions depend
                  // on the rendered image box, which a print engine decides, and
                  // a note in the wrong place is worse than a note in a list.
                  (pinsByFile.get(f.id) ?? []).length
                    ? `<ol style="margin:4px 0 0;padding-left:14px">${(pinsByFile.get(f.id) ?? [])
                        .map((p) => `<li>${esc(p.body)}</li>`)
                        .join("")}</ol>`
                    : ""
                }</figcaption></figure>`
          )
          .join("")}</div>`
      : ""
  }

  ${packetFoot(
    `Prepared by ${esc(user.name)} on ${esc(fmt(today()))} from attendance, coursework, and assessment records maintained contemporaneously by ${esc(school!.name)}.
    ${
      // Derived, so it disappears once this rail has real paid cycles behind it.
      // NOTE: this sentence prints on a document that goes to the state. It
      // reads as a disclaimer of accuracy on a funding request — worth deciding
      // whether it belongs here at all, or only on the school's working copy.
      railV && railV.level === "unverified"
        ? "<br>Format requirements for this program have not been verified against a live submission."
        : ""
    }`
  )}
  </body></html>`;

  await logAudit(user.id, "packet_printed", inv.id);
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
