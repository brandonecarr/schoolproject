// GET /student/portfolio/print — a printable portfolio for the family.
//
// The ONLY way this collection leaves the app, and deliberately so: printing
// hands the file to the family, who decide who sees it. There is no share URL,
// no public page and no token, because this is a named child's work and their
// own writing about it.

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { portfolioFor } from "@/lib/portfolio-read";
import { renderText } from "@/lib/markdown";
import { fmt, today } from "@/lib/dates";

export const dynamic = "force-dynamic";

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET() {
  const { user } = await requireRole("student");
  const sid = user.studentId ?? "";
  const [student, pieces] = await Promise.all([
    prisma.student.findUnique({ where: { id: sid } }),
    portfolioFor(sid),
  ]);
  if (!student) return new Response("Not found", { status: 404 });

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <title>${esc(student.name)} — Portfolio</title>
  <style>
  @page { margin: 18mm; }
  body { font-family: Georgia, "Times New Roman", serif; color:#141C26; line-height:1.6; max-width: 760px; margin: 0 auto; }
  h1 { font-size: 26pt; margin: 0 0 2px; }
  .sub { font-family:-apple-system,sans-serif; font-size:9.5pt; color:#5C6672; margin-bottom: 22px; }
  .piece { page-break-inside: avoid; margin: 0 0 26px; padding-bottom: 18px; border-bottom: 1px solid #DCDFD8; }
  .piece h2 { font-size: 15pt; margin: 0 0 2px; }
  .meta { font-family:-apple-system,sans-serif; font-size:8.5pt; color:#5C6672; margin-bottom: 8px; }
  .piece img { max-width: 340px; width:100%; border:1px solid #DCDFD8; border-radius:4px; display:block; margin: 8px 0; }
  blockquote { margin: 10px 0 0; padding-left: 12px; border-left: 3px solid #C8E64B; }
  .foot { font-family:-apple-system,sans-serif; font-size:8.5pt; color:#5C6672; margin-top: 26px; }
  </style></head><body>
  <h1>${esc(student.name)}</h1>
  <div class="sub">Portfolio · chosen by ${esc(student.name.split(" ")[0])} · printed ${esc(fmt(today()))}</div>
  ${
    pieces.length === 0
      ? `<p>Nothing chosen yet.</p>`
      : pieces
          .map(
            (p, i) => `<div class="piece">
      <h2>${i + 1}. ${esc(p.title)}</h2>
      <div class="meta">${esc(p.sourceLabel)}${p.score ? ` · ${esc(p.score)}` : ""}${
        p.when ? ` · ${esc(fmt(p.when.slice(0, 10)))}` : ""
      }</div>
      ${p.fileId && p.isImage ? `<img src="/files/${esc(p.fileId)}" alt="${esc(p.title)}">` : ""}
      ${
        p.reflection
          ? `<blockquote>${renderText(p.reflection, p.reflectionFormat === "markdown" ? "markdown" : "plain")}</blockquote>`
          : ""
      }
    </div>`
          )
          .join("")
  }
  <div class="foot">
    Private to ${esc(student.name.split(" ")[0])}&rsquo;s family and school. Cohort does not publish student portfolios.
  </div>
  </body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
