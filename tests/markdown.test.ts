import { describe, it, expect } from "vitest";
import {
  renderMarkdown,
  renderPlain,
  renderText,
  stripMarkdown,
  safeUrl,
  escapeHtml,
} from "@/lib/markdown";

describe("escaping — the whole security model", () => {
  it("never lets raw HTML through", () => {
    const out = renderMarkdown('<script>alert("xss")</script>');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("neutralises an img onerror payload", () => {
    const out = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(out).not.toMatch(/<img[^>]*onerror/i);
    expect(out).toContain("&lt;img");
  });

  it("neutralises an iframe", () => {
    const out = renderMarkdown('<iframe src="https://evil.test"></iframe>');
    expect(out).not.toContain("<iframe");
  });

  it("keeps event handlers inert even when wrapped in markdown", () => {
    const out = renderMarkdown('**bold** <div onclick="steal()">x</div>');
    expect(out).toContain("<strong>bold</strong>");
    // The words "div" and "onclick" survive as visible text — that's fine and
    // expected. What must never exist is a real tag carrying a real handler.
    expect(out).not.toMatch(/<div/i);
    expect(out).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);
    expect(out).toContain("&lt;div onclick=&quot;steal()&quot;&gt;");
  });

  it("escapes quotes and ampersands", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("safeUrl", () => {
  it("allows http, https, mailto, and relative paths", () => {
    expect(safeUrl("https://example.com")).toBe("https://example.com");
    expect(safeUrl("http://example.com")).toBe("http://example.com");
    expect(safeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeUrl("/files/abc")).toBe("/files/abc");
  });

  it("rejects javascript:, data:, and protocol-relative URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(safeUrl("vbscript:msgbox")).toBeNull();
    expect(safeUrl("//evil.test/x")).toBeNull();
  });
});

describe("links", () => {
  it("renders a safe link and marks external ones noopener", () => {
    const out = renderMarkdown("[docs](https://example.com)");
    expect(out).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>');
  });

  it("renders internal links without a new tab", () => {
    expect(renderMarkdown("[roster](/students)")).toContain('<a href="/students">roster</a>');
  });

  it("refuses to emit a javascript: href, leaving the text literal", () => {
    const out = renderMarkdown("[click](javascript:alert(1))");
    // The source text stays visible (harmless); no anchor and no href is built.
    expect(out).not.toContain("<a ");
    expect(out).not.toMatch(/href=/i);
    expect(out).toBe("<p>[click](javascript:alert(1))</p>");
  });

  it("refuses a data: href too", () => {
    const out = renderMarkdown("[x](data:text/html,<script>alert(1)</script>)");
    expect(out).not.toContain("<a ");
    expect(out).not.toMatch(/href=/i);
    expect(out).not.toContain("<script>");
  });
});

describe("images", () => {
  it("allows images we serve ourselves", () => {
    expect(renderMarkdown("![work](/files/abc123)")).toContain(
      '<img src="/files/abc123" alt="work" loading="lazy">'
    );
  });

  it("does not embed third-party images", () => {
    const out = renderMarkdown("![tracker](https://evil.test/pixel.png)");
    expect(out).not.toContain("<img");
  });
});

describe("block elements", () => {
  it("renders headings, shifted down so the page keeps its h1", () => {
    expect(renderMarkdown("# Title")).toBe("<h2>Title</h2>");
    expect(renderMarkdown("## Sub")).toBe("<h3>Sub</h3>");
  });

  it("renders unordered and ordered lists", () => {
    expect(renderMarkdown("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(renderMarkdown("1. one\n2. two")).toBe("<ol><li>one</li><li>two</li></ol>");
  });

  it("renders blockquotes and rules", () => {
    expect(renderMarkdown("> quoted")).toBe("<blockquote>quoted</blockquote>");
    expect(renderMarkdown("---")).toBe("<hr>");
  });

  it("renders fenced code without interpreting markdown inside", () => {
    const out = renderMarkdown("```\n**not bold**\n```");
    expect(out).toBe("<pre><code>**not bold**</code></pre>");
  });

  it("groups consecutive lines into one paragraph and splits on blank lines", () => {
    expect(renderMarkdown("a\nb\n\nc")).toBe("<p>a b</p><p>c</p>");
  });
});

describe("emphasis", () => {
  it("supports * and ** ", () => {
    expect(renderMarkdown("*a* and **b**")).toBe("<p><em>a</em> and <strong>b</strong></p>");
  });

  it("leaves snake_case alone — underscores are not emphasis", () => {
    const out = renderMarkdown("use file_name_here");
    expect(out).toBe("<p>use file_name_here</p>");
    expect(out).not.toContain("<em>");
  });
});

describe("renderPlain / renderText", () => {
  it("preserves newlines and escapes plain text", () => {
    expect(renderPlain("a\nb")).toBe("<p>a<br>b</p>");
    expect(renderPlain("<b>x</b>")).toBe("<p>&lt;b&gt;x&lt;/b&gt;</p>");
  });

  it("leaves legacy plain content unformatted", () => {
    // Content written before rich text must not suddenly reinterpret its symbols.
    expect(renderText("3 * 4 * 5", "plain")).toBe("<p>3 * 4 * 5</p>");
    expect(renderText("# not a heading", "plain")).toBe("<p># not a heading</p>");
  });

  it("formats when asked to", () => {
    expect(renderText("# Heading", "markdown")).toBe("<h2>Heading</h2>");
  });
});

describe("stripMarkdown", () => {
  it("reduces syntax to readable text for snippets", () => {
    expect(stripMarkdown("# Title\n\n**bold** and [link](https://x.test)")).toBe(
      "Title bold and link"
    );
    expect(stripMarkdown("- one\n- two")).toBe("one two");
  });

  it("drops code fences", () => {
    expect(stripMarkdown("before\n```\ncode\n```\nafter")).toBe("before after");
  });
});
