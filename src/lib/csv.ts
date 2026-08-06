// CSV serialization for record exports.
//
// Quoting rules matter here: these files get opened in Excel and Google Sheets
// by people submitting them to a state, so a stray comma in an assignment title
// must not shift every column.

export function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  // Guard against spreadsheet formula injection (a title starting with = or +).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  // CRLF + a UTF-8 BOM keeps Excel happy with accented names.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
