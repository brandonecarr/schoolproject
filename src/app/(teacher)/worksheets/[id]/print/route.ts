// GET /worksheets/[id]/print — the worksheet as a standalone, printable HTML
// document (save-as-PDF for paper). A route handler so it bypasses the console
// shell. `?key=1` prints the answer-key version. Mirrors the invoice packet.

import { NextResponse } from "next/server";
import { getSession, logAudit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { packetCss, letterhead, packetFoot } from "@/lib/packet";
import { brandForSchool } from "@/lib/packet-read";
import { parseItems, quizMax, seededOrder } from "@/lib/lms";
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
      } else if (it.kind === "multi") {
        const correct = new Set(it.answerIndices ?? []);
        body = `<ol class="choices" type="A">${(it.choices ?? [])
          .map(
            (c, ci) =>
              `<li class="${showKey && correct.has(ci) ? "key" : ""}"><span class="box"></span>${esc(c)}</li>`
          )
          .join("")}</ol><div class="hint">Tick every correct answer.</div>`;
      } else if (it.kind === "numeric") {
        body = `<div class="fill">${
          showKey && typeof it.numAnswer === "number"
            ? `<span class="keytag">${it.numAnswer}${it.tolerance ? ` ± ${it.tolerance}` : ""}</span>`
            : "____________________"
        }</div>`;
      } else if (it.kind === "matching") {
        // On paper the right column is listed A, B, C… and the student writes
        // the letter next to each prompt.
        const pairs = it.pairs ?? [];
        const order = seededOrder(it.id, pairs.length);
        const letterFor = (origIdx: number) =>
          String.fromCharCode(65 + order.findIndex((o) => o === origIdx));
        body = `<table class="match"><tbody>${pairs
          .map(
            (p, i) =>
              `<tr><td class="mline">${showKey ? `<span class="keytag">${esc(letterFor(i))}</span>` : "____"}</td><td>${esc(p.left)}</td><td class="mright">${esc(
                String.fromCharCode(65 + i)
              )}. ${esc(pairs[order[i]].right)}</td></tr>`
          )
          .join("")}</tbody></table>`;
      } else if (it.kind === "ordering") {
        const steps = it.ordering ?? [];
        const order = seededOrder(it.id, steps.length);
        body = `<table class="match"><tbody>${order
          .map(
            (origIdx) =>
              `<tr><td class="mline">${showKey ? `<span class="keytag">${origIdx + 1}</span>` : "____"}</td><td>${esc(steps[origIdx])}</td></tr>`
          )
          .join("")}</tbody></table><div class="hint">Number them in order.</div>`;
      } else {
        body = blank + blank;
      }
      return `<li class="q"><div class="qp">${esc(it.prompt || "—")} <span class="pts">(${it.points} pts)</span></div>${body}</li>`;
    })
    .join("");

  const brand = await brandForSchool(school!.id);
  const printCss = `${packetCss(brand)}
  body{line-height:1.5;max-width:820px}
  .name-row{display:flex;justify-content:space-between;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:10pt;color:#5C6672;border:1px solid #DCDFD8;border-radius:8px;padding:10px 14px;margin:0 0 20px}
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
  .box{display:inline-block;width:13px;height:13px;border:1.5px solid #141C26;flex:0 0 auto}
  .hint{font-family:-apple-system,sans-serif;font-size:9pt;color:#5C6672;margin-top:4px}
  table.match{width:100%;border-collapse:collapse;margin-top:6px}
  table.match td{padding:4px 6px;vertical-align:top;font-size:11pt}
  td.mline{width:46px;border-bottom:1px solid #C7CBC0;text-align:center}
  td.mright{color:#5C6672}
  .tf{display:flex;align-items:center;gap:6px;font-family:-apple-system,sans-serif}
  .fill{margin-top:8px;font-family:-apple-system,sans-serif}
  .lines span{display:block;border-bottom:1px solid #C7CBC0;height:26px}
  .keytag{background:#E8F2B8;border-radius:4px;padding:1px 8px;font-family:-apple-system,sans-serif;font-size:10pt}
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

  ${letterhead(brand)}

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

  ${packetFoot(
    `${esc(school!.name)}${showKey ? " · answer key — do not distribute" : ""}`
  )}
  </body></html>`;

  await logAudit(user.id, showKey ? "worksheet_key_printed" : "worksheet_printed", ws.id);
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
