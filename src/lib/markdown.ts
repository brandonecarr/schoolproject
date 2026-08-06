// A small, dependency-free markdown renderer.
//
// SECURITY MODEL — read this before changing anything here.
//
// The input is written by teachers and stored in a database that also holds
// children's records, so a stored-XSS hole would be serious. The defence is
// structural rather than a blocklist:
//
//   1. EVERY character of the source is HTML-escaped FIRST.
//   2. Markdown patterns are then matched against that already-escaped text,
//      and the only HTML that ever exists in the output is tags this file
//      writes itself.
//
// Because of step 1, raw HTML in the source ("<script>…") can never survive as
// markup — it is inert text by the time any transform runs. There is no
// sanitiser to keep up to date and no allowlist to get wrong.
//
// URLs are the one place attacker-controlled text reaches an attribute, so they
// go through safeUrl(), which permits only http, https, mailto, and same-origin
// relative paths. javascript:, data:, and protocol-relative "//evil.com" are
// rejected.
//
// Emphasis uses * and ** only. Underscores are left alone on purpose so that
// snake_case identifiers and file_names don't turn into italics mid-sentence.

export type TextFormat = "plain" | "markdown";

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

// Only http(s), mailto, and same-origin relative paths. Everything else — most
// importantly javascript: and data: — is refused.
export function safeUrl(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
  if (u.startsWith("/") && !u.startsWith("//")) return u; // relative, not protocol-relative
  return null;
}

// Inline spans, applied to text that is ALREADY escaped.
function inline(text: string): string {
  let out = text;

  // `code`
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);

  // ![alt](src) — images are restricted to files we serve ourselves, so a page
  // can't be made to beacon out to a third party.
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => {
    const safe = safeUrl(src);
    if (!safe || !safe.startsWith("/files/")) return m;
    return `<img src="${safe}" alt="${alt}" loading="lazy">`;
  });

  // [text](href)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    const safe = safeUrl(href);
    if (!safe) return m; // leave the literal text; never emit a bad href
    const external = /^https?:\/\//i.test(safe);
    const rel = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${safe}"${rel}>${label}</a>`;
  });

  // **strong** then *em* (order matters).
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  return out;
}

const LIST_ITEM = /^\s*[-*]\s+(.*)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.*)$/;

export function renderMarkdown(src: string): string {
  if (!src) return "";
  const lines = escapeHtml(src).replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];

  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];
  let code: string[] | null = null;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(
        `<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.type}>`
      );
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
      quote = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    // fenced code block
    if (/^\s*```/.test(line)) {
      if (code === null) {
        flushAll();
        code = [];
      } else {
        out.push(`<pre><code>${code.join("\n")}</code></pre>`);
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    // horizontal rule
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushAll();
      out.push("<hr>");
      continue;
    }

    // heading (### max — h1 belongs to the page, not the body)
    const h = line.match(/^\s*(#{1,3})\s+(.*)$/);
    if (h) {
      flushAll();
      const level = Math.min(h[1].length + 1, 4); // # -> h2, ## -> h3, ### -> h4
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    // blockquote
    const q = line.match(/^\s*&gt;\s?(.*)$/); // ">" is escaped by now
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]);
      continue;
    }

    // lists
    const ul = line.match(LIST_ITEM);
    const ol = line.match(ORDERED_ITEM);
    if (ul || ol) {
      flushPara();
      flushQuote();
      const type = ul ? "ul" : "ol";
      const text = (ul ? ul[1] : ol![1]) ?? "";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(text);
      continue;
    }

    flushList();
    flushQuote();
    para.push(line.trim());
  }

  if (code !== null) out.push(`<pre><code>${code.join("\n")}</code></pre>`);
  flushAll();
  return out.join("");
}

// Plain text: escaped, with newlines preserved. Used for content authored
// before rich text existed, so it renders exactly as it always did.
export function renderPlain(src: string): string {
  if (!src) return "";
  return `<p>${escapeHtml(src).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>")}</p>`;
}

export function renderText(src: string, format: TextFormat = "plain"): string {
  return format === "markdown" ? renderMarkdown(src) : renderPlain(src);
}

// Markdown reduced to readable text — for table cells, list snippets, CSV
// exports, and anywhere else raw syntax would be noise.
export function stripMarkdown(src: string): string {
  if (!src) return "";
  return src
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*&gt;\s?/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*(-{3,}|\*{3,})\s*$/gm, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
