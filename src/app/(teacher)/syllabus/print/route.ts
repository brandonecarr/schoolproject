// GET /syllabus/print — the syllabus as a standalone printable document.
// Same pattern as the invoice packet, worksheet, and student record.

import { NextResponse } from "next/server";
import { getSession, logAudit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { packetCss, letterhead, packetFoot, printBar } from "@/lib/packet";
import { brandForSchool } from "@/lib/packet-read";
import { fmt, today } from "@/lib/dates";
import { typeMeta } from "@/lib/lms";

export const dynamic = "force-dynamic";

const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !["owner", "teacher"].includes(session.user.role)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const { user, school } = session;
  const schoolId = school!.id;

  const [courses, modules, items, pages, assignments] = await Promise.all([
    prisma.course.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } }),
    prisma.module.findMany({ where: { schoolId }, orderBy: { position: "asc" } }),
    prisma.moduleItem.findMany({ where: { schoolId }, orderBy: { position: "asc" } }),
    prisma.page.findMany({ where: { schoolId } }),
    prisma.assignment.findMany({ where: { schoolId }, orderBy: { dueDate: "asc" } }),
  ]);

  const itemsOf = (moduleId: string) => items.filter((i) => i.moduleId === moduleId);
  const labelOf = (kind: string, refId: string, title: string) => {
    if (kind === "header") return title || "Section";
    if (kind === "page") return pages.find((p) => p.id === refId)?.title ?? "(removed)";
    return assignments.find((a) => a.id === refId)?.title ?? "(removed)";
  };

  const renderModules = (courseId: string | null) =>
    modules
      .filter((m) => m.courseId === courseId)
      .map((m) => {
        const rows = itemsOf(m.id)
          .map((i) => {
            const a = i.kind === "assignment" ? assignments.find((x) => x.id === i.refId) : null;
            return `<tr><td style="width:110px">${esc(
              i.kind === "page" ? "Reading" : i.kind === "header" ? "Section" : "Assignment"
            )}</td><td>${esc(labelOf(i.kind, i.refId, i.title))}${
              a ? ` <span class="muted">— ${esc(typeMeta(a.type).label)}, ${a.points} pts, due ${esc(fmt(a.dueDate))}</span>` : ""
            }</td></tr>`;
          })
          .join("");
        return `<h3>${esc(m.name)}</h3>${
          m.description ? `<p class="muted">${esc(m.description)}</p>` : ""
        }<table><tbody>${rows || `<tr><td colspan="2">Empty</td></tr>`}</tbody></table>`;
      })
      .join("");

  const brand = await brandForSchool(schoolId);
  const css = `${packetCss(brand)}
  body{font-size:11.5pt;line-height:1.5}
  h1{font-size:22pt}
  h2{font-size:13pt;text-transform:none;letter-spacing:0;color:#141C26;margin:26px 0 4px;border-bottom:1px solid #DCDFD8;padding-bottom:4px;font-family:ui-serif,Georgia,serif}
  h3{font-size:11.5pt;margin:16px 0 4px}
  .muted{color:#5C6672}
  td{padding:5px 8px;font-size:10.5pt;vertical-align:top}
  .head{display:block}
  @media print{@page{margin:16mm}}
  `;

  const schoolWide = renderModules(null);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Syllabus — ${esc(
    school!.name
  )}</title><style>${css}</style></head><body>
  ${printBar(`Syllabus · ${school!.name}`, "/syllabus")}

  ${letterhead(brand)}

  <div class="head">
    <h1>Course of study</h1>
    <div class="sub">Prepared ${esc(fmt(today()))}</div>
  </div>

  ${schoolWide ? `<h2>School-wide</h2>${schoolWide}` : ""}

  ${courses
    .map((c) => {
      const mods = renderModules(c.id);
      const loose = assignments.filter(
        (a) => a.courseId === c.id && !items.some((i) => i.kind === "assignment" && i.refId === a.id)
      );
      return `<h2>${esc(c.name)} <span class="sub">— ${esc(c.subject)}</span></h2>${
        mods || `<p class="muted">No modules defined.</p>`
      }${
        loose.length
          ? `<h3>Additional assignments</h3><table><tbody>${loose
              .map(
                (a) =>
                  `<tr><td style="width:110px">Assignment</td><td>${esc(a.title)} <span class="muted">— ${a.points} pts, due ${esc(fmt(a.dueDate))}</span></td></tr>`
              )
              .join("")}</tbody></table>`
          : ""
      }`;
    })
    .join("")}

  ${packetFoot(
    `Generated from the courses, modules, and assignments recorded by ${esc(school!.name)} on ${esc(fmt(today()))}.`
  )}
  </body></html>`;

  await logAudit(user.id, "syllabus_printed", school!.name);
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
