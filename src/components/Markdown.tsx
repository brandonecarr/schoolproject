// Renders stored body text. Server component.
//
// dangerouslySetInnerHTML is safe here because renderText() escapes the entire
// source before applying any transform — the only HTML in its output is markup
// that renderer wrote itself. See the security note at the top of lib/markdown.ts.

import { renderText, type TextFormat } from "@/lib/markdown";

export function Markdown({
  text,
  format = "plain",
  className = "",
}: {
  text: string;
  format?: TextFormat | string;
  className?: string;
}) {
  if (!text) return null;
  const html = renderText(text, format === "markdown" ? "markdown" : "plain");
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
