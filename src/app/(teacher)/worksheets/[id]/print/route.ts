// GET /worksheets/[id]/print — the worksheet as a standalone, printable HTML
// document (save-as-PDF for paper). A route handler so it bypasses the console
// shell. `?key=1` prints the answer-key version. Mirrors the invoice packet.

import { NextResponse } from "next/server";
import { getSession, logAudit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseItems, quizMax } from "@/lib/lms";
import { renderText } from "@/lib/markdown";

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
  const { user, school } = session;
  const { id } = await params;
  const showKey = new URL(req.url).searchParams.get("key") === "1";

  const ws = await prisma.worksheet.findFirst({ where: { id, schoolId: school!.id } });
  if (!ws) return new Response("Worksheet not found.", { status: 404 });
  const items = parseItems(ws.itemsJson);

  const blank = `<div class="lines"><span></span><span></span></div>`;

  const questions = items
    .map((it, i) => {
      let body = "";
      if (it.kind === "mc") {
        body = `<ol class="choices" type="A">${(it.choices ?? [])
          .map(
            (c, ci) =>
              `<li class="${showKey && it.answerIndex === ci ? "key" : ""}"><span class="bubble"></span>${esc(
                c
              )}</li>`
          )
          .join("")}</ol>`;
      } else if (it.kind === "tf") {
        body = `<div class="tf"><span class="bubble"></span>True &nbsp;&nbsp; <span class="bubble"></span>False${
          showKey ? ` <span class="keytag">answer: ${it.answerIndex === 0 ? "True" : "False"}</span>` : ""
        }</div>`;
      } else if (it.kind === "fill") {
        body = `<div class="fill">${
          showKey && it.answer ? `<span class="keytag">${esc(it.answer)}</span>` : "____________________"
        }</div>`;
      } else {
        body = blank + blank;
      }
      return `<li class="q"><div class="qp">${esc(it.prompt || "—")} <span class="pts">(${it.points} pts)</span></div>${body}</li>`;
    })
    .join("");

  const printCss = `
  *{box-sizing:border-box}
  body{margin:0;padding:44px;font-family:ui-serif,Georgia,"Times New Roman",serif;color:#141C26;font-size:12pt;line-height:1.5;background:#fff;max-width:820px}
  .name-row{display:flex;justify-content:space-between;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:10pt;color:#5C6672;border:1px solid #DCDFD8;border-radius:8px;padding:10px 14px;margin:0 0 20px}
  h1{font-size:20pt;margin:0 0 2px}
  .sub{font-family:-apple-system,sans-serif;font-size:10pt;color:#5C6672;margin-bottom:4px}
  .instr{border-left:3px solid #141C26;padding-left:14px;margin:14px 0 22px;font-style:italic}
  ol.qs{padding-left:24px;margin:0}
  li.q{margin:0 0 22px;padding:0}
  .qp{font-weight:600;margin-bottom:8px}
  .pts{font-weight:400;font-family:-apple-system,sans-serif;font-size:9pt;color:#5C6672}
  ol.choices{margin:6px 0 0;padding-left:8px;list-style:none}
  ol.choices li{margin:4px 0;display:flex;align-items:center;gap:8px}
  ol.choices li.key{font-weight:700}
  .bubble{display:inline-block;width:13px;height:13px;border:1.5px solid #141C26;border-radius:50%;flex:0 0 auto}
  .tf{display:flex;align-items:center;gap:6px;font-family:-apple-system,sans-serif}
  .fill{margin-top:8px;font-family:-apple-system,sans-serif}
  .lines span{display:block;border-bottom:1px solid #C7CBC0;height:26px}
  .keytag{background:#E8F2B8;border-radius:4px;padding:1px 8px;font-family:-apple-system,sans-serif;font-size:10pt}
  .foot{margin-top:26px;padding-top:12px;border-top:1px solid #DCDFD8;font-family:-apple-system,sans-serif;font-size:9pt;color:#5C6672}
  .bar{position:fixed;top:0;left:0;right:0;background:#1F3A6E;color:#fff;padding:10px 18px;font-family:-apple-system,sans-serif;font-size:13px;display:flex;gap:14px;align-items:center;justify-content:space-between}
  .bar a,.bar button{font:inherit;padding:6px 14px;border-radius:7px;border:0;cursor:pointer;text-decoration:none}
  .bar button{background:#C8E64B;color:#2F3908;font-weight:700}
  .bar a{background:rgba(255,255,255,.15);color:#fff}
  body{padding-top:96px}
  @media print{.bar{display:none}body{padding:0}@page{margin:16mm}}
  `;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(ws.title)}${
    showKey ? " — answer key" : ""
  }</title><style>${printCss}</style></head><body>
  <div class="bar">
    <span>${showKey ? "Answer key" : "Student copy"} · ${esc(school!.name)}</span>
    <span>
      <a href="/worksheets/${esc(ws.id)}/print${showKey ? "" : "?key=1"}">${
        showKey ? "Student copy" : "Answer key"
      }</a>
      <a href="/worksheets/${esc(ws.id)}">Back</a>
      <button onclick="window.print()">Print / Save as PDF</button>
    </span>
  </div>

  <div class="name-row"><span>Name: ________________________</span><span>Date: ____________</span></div>
  <h1>${esc(ws.title)}</h1>
  <div class="sub">${esc(ws.subject || "")} · ${items.length} question${
    items.length === 1 ? "" : "s"
  } · ${quizMax(items)} points</div>
  ${
    ws.instructions
      ? `<div class="instr">${renderText(
          ws.instructions,
          ws.instructionsFormat === "markdown" ? "markdown" : "plain"
        )}</div>`
      : ""
  }
  <ol class="qs">${questions || "<li>No questions.</li>"}</ol>

  <div class="foot">Generated with Cohort${showKey ? " · answer key — do not distribute" : ""}.</div>
  </body></html>`;

  await logAudit(user.id, showKey ? "worksheet_key_printed" : "worksheet_printed", ws.id);
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
