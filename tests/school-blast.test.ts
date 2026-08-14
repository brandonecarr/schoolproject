// Email blasts — teacher-designed announcements sent to parents' inboxes.
//
// The properties that matter: the block parser is a real boundary (crafted
// JSON degrades to fewer blocks, never to markup), the renderer escapes
// everything and appends the identity footer itself, the send action
// re-resolves its audience from the database and respects emailAlerts, and
// the HTML path stays quarantined to blasts — automatic notifications remain
// text-only.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseBlocks,
  blocksToHtml,
  blocksToText,
  MAX_BLOCKS,
  type EmailBlock,
} from "../src/lib/email-blocks";
import { TEACHER_NAV } from "../src/lib/nav";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const brand = { schoolName: "Cedar Grove", accentColor: "" };

describe("parseBlocks is a real boundary", () => {
  it("round-trips a valid block list", () => {
    const blocks: EmailBlock[] = [
      { kind: "heading", text: "Field trip" },
      { kind: "text", text: "Forms due Friday.\nSee below." },
      { kind: "button", label: "Open the form", url: "https://example.com/form" },
      { kind: "image", url: "https://example.com/bus.jpg", alt: "The bus" },
      { kind: "divider" },
      { kind: "spacer" },
    ];
    expect(parseBlocks(JSON.stringify(blocks))).toEqual(blocks);
  });

  it("garbage degrades to nothing, never throws", () => {
    expect(parseBlocks("not json")).toEqual([]);
    expect(parseBlocks('{"kind":"text"}')).toEqual([]);
    expect(parseBlocks("null")).toEqual([]);
    expect(parseBlocks(JSON.stringify([null, 42, "x", {}]))).toEqual([]);
  });

  it("there is NO raw-HTML block — an html kind is dropped, not rendered", () => {
    const out = parseBlocks(JSON.stringify([{ kind: "html", html: "<script>x</script>" }]));
    expect(out).toEqual([]);
  });

  it("non-http(s) URLs neutralize the block", () => {
    const out = parseBlocks(
      JSON.stringify([
        { kind: "button", label: "x", url: "javascript:alert(1)" },
        { kind: "image", url: "data:text/html,<script>", alt: "" },
        { kind: "button", label: "ok", url: "https://example.com" },
      ])
    );
    expect(out).toEqual([{ kind: "button", label: "ok", url: "https://example.com" }]);
  });

  it("alignment: center/right survive, left is stored as absence, junk drops", () => {
    const out = parseBlocks(
      JSON.stringify([
        { kind: "heading", text: "a", align: "center" },
        { kind: "text", text: "b", align: "right" },
        { kind: "text", text: "c", align: "left" },
        { kind: "button", label: "d", url: "https://e.com", align: "justify" },
      ])
    );
    expect(out).toEqual([
      { kind: "heading", text: "a", align: "center" },
      { kind: "text", text: "b", align: "right" },
      { kind: "text", text: "c" },
      { kind: "button", label: "d", url: "https://e.com" },
    ]);
  });

  it("caps the list at MAX_BLOCKS", () => {
    const many = Array.from({ length: MAX_BLOCKS + 10 }, () => ({ kind: "divider" }));
    expect(parseBlocks(JSON.stringify(many))).toHaveLength(MAX_BLOCKS);
  });

  it("empty text blocks are dropped; oversized text is truncated", () => {
    expect(parseBlocks(JSON.stringify([{ kind: "heading", text: "   " }]))).toEqual([]);
    const [b] = parseBlocks(JSON.stringify([{ kind: "text", text: "x".repeat(9000) }]));
    expect(b.kind === "text" && b.text.length).toBe(4000);
  });
});

describe("blocksToHtml", () => {
  it("escapes every string that came from a person", () => {
    const html = blocksToHtml(
      [
        { kind: "heading", text: '<script>alert("h")</script>' },
        { kind: "text", text: "a < b & c" },
        { kind: "button", label: "<img onerror=x>", url: 'https://e.com/?q="><script>' },
      ],
      { schoolName: '<b>Evil</b> "School"', accentColor: "" }
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img onerror");
    expect(html).not.toContain("<b>Evil</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("carries the school's identity and the why-you-got-this footer", () => {
    const html = blocksToHtml([{ kind: "text", text: "hi" }], brand);
    expect(html).toContain("Cedar Grove");
    expect(html).toContain("receiving this because your child attends");
    expect(html).toContain("turn these emails off");
  });

  it("uses the school's validated accent when set", () => {
    const html = blocksToHtml([{ kind: "divider" }], {
      schoolName: "X",
      accentColor: "#1f3a6e",
    });
    expect(html).toContain("#1f3a6e");
  });

  it("multiline text becomes <br>, not raw newlines lost to HTML collapse", () => {
    const html = blocksToHtml([{ kind: "text", text: "one\ntwo" }], brand);
    expect(html).toContain("one<br>two");
  });

  it("alignment: text-align for prose, td align for buttons and images (the Outlook-safe way)", () => {
    const html = blocksToHtml(
      [
        { kind: "heading", text: "h", align: "center" },
        { kind: "text", text: "t", align: "right" },
        { kind: "button", label: "b", url: "https://e.com", align: "center" },
        { kind: "image", url: "https://e.com/i.png", alt: "", align: "right" },
        { kind: "text", text: "plain" },
      ],
      brand
    );
    expect(html).toContain("text-align:center;");
    expect(html).toContain("text-align:right;");
    expect(html).toContain('<td align="center">');
    expect(html).toContain('<td align="right">');
    // The unaligned block carries no alignment at all.
    expect(html).toContain('color:#3a3f4e;">plain</p>');
  });
});

describe("blocksToText — the plain twin", () => {
  it("says the same things without markup", () => {
    const text = blocksToText(
      [
        { kind: "heading", text: "Field trip" },
        { kind: "button", label: "Form", url: "https://e.com" },
      ],
      brand
    );
    expect(text).toContain("FIELD TRIP");
    expect(text).toContain("Form: https://e.com");
    expect(text).toContain("Cedar Grove");
    expect(text).toContain("your child attends");
  });
});

describe("the send action", () => {
  const action = read("src/app/(teacher)/email/actions.ts");

  it("gates on requireTeacher and re-parses blocks server-side", () => {
    expect(action).toContain("requireTeacher()");
    expect(action).toContain("parseBlocks(");
  });

  it("requires the armed confirmation — no accidental sends", () => {
    expect(action).toContain('formData.get("confirm") !== "on"');
    expect(action).toContain("error=confirm");
  });

  it("resolves the audience from the database and respects emailAlerts", () => {
    expect(action).toContain("emailAlerts: true");
    // The recipient set is deduped by lowercased address.
    expect(action).toContain("new Set(");
    expect(action).toContain("toLowerCase()");
  });

  it("refuses when email is unconfigured rather than logging a fake send", () => {
    expect(action.indexOf("emailConfigured()")).toBeGreaterThan(-1);
    expect(action.indexOf("emailConfigured()")).toBeLessThan(action.indexOf("schoolBlast.create"));
  });

  it("logs the blast with the exact blocks and an audit entry", () => {
    expect(action).toContain("schoolBlast.create");
    expect(action).toContain("blocksJson: JSON.stringify(blocks)");
    expect(action).toContain("logAudit");
  });
});

describe("image uploads", () => {
  const action = read("src/app/(teacher)/email/actions.ts");
  const route = read("src/app/blast-img/[token]/route.ts");

  it("the upload action is teacher-gated, image-only, and size-capped", () => {
    const fn = action.slice(action.indexOf("export async function uploadBlastImage"));
    const body = fn.slice(0, fn.indexOf("export async function sendSchoolBlast"));
    expect(body).toContain("requireTeacher()");
    expect(body).toContain("BLAST_IMAGE_TYPES[file.type]");
    expect(body).toContain("BLAST_IMAGE_MAX");
    // Not child data: the retention purge is scoped away from these.
    expect(body).toContain("studentId: null");
    // The token comes from the token generator, never from the client.
    expect(body).toContain("newTokenValue()");
  });

  it("the public route serves ONLY token-carrying image rows, cacheably", () => {
    // Lookup is by publicToken alone — a plain FileRec id can never resolve.
    expect(route).toContain("where: { publicToken: token }");
    expect(route).toContain("IMAGE_MIMES.has(f.mime)");
    expect(route).toContain("immutable");
    // No session machinery: mail clients can't sign in.
    expect(route).not.toContain("getSession");
  });

  it("the URL handed to the block is absolute — it must work inside an inbox", () => {
    expect(action).toMatch(/originFor\(school!\.slug\) \|\| appUrl\(\)/);
    expect(action).toContain("/blast-img/${publicToken}");
  });
});

describe("the HTML path stays quarantined", () => {
  it("EmailMessage.html is optional and only the blast action sets it", () => {
    const email = read("src/lib/email.ts");
    expect(email).toContain("html?: string");
    // Automatic notifications never send HTML.
    const notify = read("src/lib/notify.ts");
    expect(notify).not.toContain("html");
  });
});

describe("navigation", () => {
  it("email blasts live in the Family group", () => {
    const family = TEACHER_NAV.find((g) => g.group === "Family");
    expect(family?.items.some((i) => i.href === "/email")).toBe(true);
  });
});
