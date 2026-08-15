// GET /claims/[id]/print — the printable expense-claim packet as a standalone
// HTML document, on the family's own letterhead. Receipt FIRST (for a claim,
// the receipt is the document), then the purpose statement, then the records
// around the purchase as supporting evidence. Nothing is transmitted; the
// parent saves as PDF and uploads it in the state portal themselves.

import { NextResponse } from "next/server";
import { getSession, logAudit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isFamily } from "@/lib/kind";
import { packetCss, letterhead, packetFoot, printBar, receiptFigures } from "@/lib/packet";
import { brandForSchool } from "@/lib/packet-read";
import { evidenceFor } from "@/lib/evidence";
import { RAILS } from "@/lib/rules";
import { categoryLabel } from "@/lib/claims";
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
  if (!isFamily(school)) return NextResponse.redirect(new URL("/invoices", req.url));
  const { id } = await params;

  const claim = await prisma.expenseClaim.findFirst({ where: { id, schoolId: school!.id } });
  if (!claim) return new Response("Claim not found.", { status: 404 });

  const [child, e, receipts, brand] = await Promise.all([
    prisma.student.findUnique({ where: { id: claim.studentId } }),
    evidenceFor(claim.studentId, claim.windowStart, claim.windowEnd),
    prisma.fileRec.findMany({
      where: { schoolId: school!.id, claimId: claim.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, mime: true },
    }),
    brandForSchool(school!.id),
  ]);
  const rail = (claim.railId ? RAILS[claim.railId] : null) ?? sessionRail;
  const graded = e.submissions.filter((x) => x.status === "graded");

  const printCss = `${packetCss(brand)}
  .samples{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
  .samples figure{margin:0;width:220px}
  .samples img{width:100%;border:1px solid #DCDFD8;border-radius:4px}
  .samples figcaption{font-family:-apple-system,sans-serif;font-size:8.5pt;color:#5C6672;margin-top:4px}
  `;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Expense claim packet — ${esc(claim.title)}</title><style>${printCss}</style></head><body>
  ${printBar(
    `Save as PDF, then upload it to ${rail ? rail.label : "your state portal"} with your claim. Nothing is sent from here.`,
    `/claims/${claim.id}`
  )}

  ${letterhead(brand)}

  <div class="head">
    <div>
      <h1>${esc(claim.title)}</h1>
      <div style="font-family:-apple-system,sans-serif;font-size:10pt;color:#5C6672">For ${esc(child ? child.name : "—")}, grade ${esc(child ? child.grade : "")} &middot; ${esc(rail ? rail.label : "ESA")} expense reimbursement claim</div>
    </div>
    <div class="meta">
      Purchased ${esc(fmt(claim.purchaseDate))}${claim.vendor ? ` from ${esc(claim.vendor)}` : ""}<br>
      ${esc(categoryLabel(claim.category))}<br>
      Amount claimed: <strong style="color:#141C26">$${Number(claim.amount).toLocaleString()}</strong>
      ${claim.portalRef ? `<br>Portal ref ${esc(claim.portalRef)}` : ""}
    </div>
  </div>

  ${receiptFigures(receipts) || `<h2>Receipt</h2><p style="margin:0;color:#5C6672">No receipt attached.</p>`}

  <h2>Educational purpose statement</h2>
  <p class="narrative">${esc(claim.purpose)}</p>

  <h2>Instruction logged around the purchase</h2>
  <p style="margin:0 0 6px">${esc(fmt(claim.windowStart))} – ${esc(fmt(claim.windowEnd))}: present <strong>${e.presentDays}</strong> of <strong>${e.instructionalDays ?? e.attendance.length}</strong> ${e.instructionalDays != null ? "instructional" : "logged"} days.</p>

  ${
    e.observations.length
      ? `<table><tbody>${e.observations.slice(0, 8).map((o) => `<tr><td style="width:90px">${esc(fmt(o.date))}</td><td>${esc(o.text)}</td></tr>`).join("")}</tbody></table>`
      : ""
  }

  ${
    graded.length
      ? `<h2>Work assessed</h2>
  <table><thead><tr><th>Assignment</th><th style="width:70px">Score</th></tr></thead><tbody>
  ${graded.map((x) => `<tr><td>${esc(x.assignmentTitle)}</td><td>${x.score}/${x.points}</td></tr>`).join("")}
  </tbody></table>`
      : ""
  }

  ${
    e.standards.length
      ? `<h2>Standards demonstrated</h2>
  <p style="margin:0 0 4px">Mastered <strong>${e.standardsMastered}</strong> of <strong>${e.standards.length}</strong> standards assessed in this window.</p>
  <table><thead><tr><th style="width:110px">Standard</th><th>Skill</th><th style="width:90px">Level</th></tr></thead><tbody>
  ${e.standards.map((st) => `<tr><td>${esc(st.code)}</td><td>${esc(st.title)}</td><td>${Math.round(st.pct * 100)}%${st.mastered ? " · mastered" : ""}</td></tr>`).join("")}
  </tbody></table>`
      : ""
  }

  ${packetFoot(
    `Prepared by ${esc(user.name)} on ${esc(fmt(today()))} from attendance, observation, and assessment records kept contemporaneously by ${esc(school!.name)}. Submitted by the family directly to the program.`
  )}
  </body></html>`;

  await logAudit(user.id, "claim_packet_printed", claim.id);
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
