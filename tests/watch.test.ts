import { describe, it, expect } from "vitest";
import {
  extractText,
  normalizeForHash,
  hashText,
  fingerprint,
  summarizeChange,
  shouldEscalate,
  MAX_TEXT,
} from "@/lib/watch";

const fp = (html: string) => fingerprint(html).hash;

describe("extractText", () => {
  it("drops script, style, noscript and svg with their contents", () => {
    const t = extractText(
      `<p>Award is $7,000</p><script>var x=1;alert('hi')</script><style>.a{color:red}</style><noscript>enable js</noscript><svg><path d="M0 0"/></svg>`
    );
    expect(t).toContain("Award is $7,000");
    expect(t).not.toContain("alert");
    expect(t).not.toContain("color:red");
    expect(t).not.toContain("enable js");
    expect(t).not.toContain("M0 0");
  });

  it("drops the whole head — titles and meta drift independently of content", () => {
    const t = extractText(`<head><title>Page</title><meta name="x" content="y"></head><body><p>Real</p></body>`);
    expect(t).not.toContain("Page");
    expect(t).toContain("Real");
  });

  it("removes HTML comments, which often carry build stamps", () => {
    expect(extractText(`<!-- built 2026-08-06 rev abc --><p>Body</p>`)).not.toContain("built");
  });

  it("keeps block structure so paragraphs don't run together", () => {
    expect(extractText(`<p>One</p><p>Two</p>`)).toMatch(/One\s*\n\s*Two/);
  });

  it("does not glue words together when stripping inline tags", () => {
    expect(extractText(`<b>Hope</b><i>Scholarship</i>`)).toMatch(/Hope\s+Scholarship/);
  });

  it("decodes the entities that actually appear in gov pages", () => {
    const t = extractText(`<p>Tom &amp; Jerry &mdash; &quot;up to&quot; &#36;7,000&nbsp;a year</p>`);
    expect(t).toContain("Tom & Jerry");
    expect(t).toContain("—");
    expect(t).toContain('"up to"');
    expect(t).toContain("$7,000");
  });

  it("leaves an unknown entity alone rather than mangling it", () => {
    expect(extractText(`<p>&notarealentity;</p>`)).toContain("&notarealentity;");
  });
});

describe("normalizeForHash — the false-alarm suppressors", () => {
  const stable = (a: string, b: string) => expect(normalizeForHash(a)).toBe(normalizeForHash(b));

  it("ignores CSRF tokens and other long hex runs", () => {
    stable("token a1b2c3d4e5f60718 rest", "token 99887766554433221100aabb rest");
  });

  it("ignores base64-ish build hashes and nonces", () => {
    stable("nonce YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM= end", "nonce QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVoxMjM= end");
  });

  it("ignores page-generation clock times", () => {
    stable("Updated 3:42 PM today", "Updated 9:07 AM today");
  });

  it("ignores ISO timestamps", () => {
    stable("built 2026-08-06T12:00:00Z ok", "built 2026-08-07T04:30:11Z ok");
  });

  it("ignores cache-busting query parameters", () => {
    stable("see /handbook.pdf?v=8891 now", "see /handbook.pdf?v=1204 now");
  });

  it("ignores invisible zero-width characters", () => {
    stable("award​ amount", "award amount");
  });

  it("is case- and whitespace-insensitive", () => {
    stable("Award   Amount\n\n$7,000", "award amount $7,000");
  });

  // The other half of the contract: it must NOT hide the things we watch for.
  it("still notices a changed award amount", () => {
    expect(normalizeForHash("award is $7,000")).not.toBe(normalizeForHash("award is $7,600"));
  });

  it("still notices a changed calendar date — deadlines are the signal", () => {
    expect(normalizeForHash("apply by March 15, 2027")).not.toBe(
      normalizeForHash("apply by April 1, 2027")
    );
  });

  it("still notices a changed administrator", () => {
    expect(normalizeForHash("administered by ClassWallet")).not.toBe(
      normalizeForHash("administered by Odyssey")
    );
  });

  it("still notices a changed eligibility rule", () => {
    expect(normalizeForHash("open to all students")).not.toBe(
      normalizeForHash("open to students with a disability")
    );
  });

  it("caps stored length so one huge page cannot bloat the database", () => {
    expect(normalizeForHash("x ".repeat(MAX_TEXT)).length).toBeLessThanOrEqual(MAX_TEXT);
  });
});

describe("fingerprint — end to end on realistic noise", () => {
  const page = (token: string, time: string, amount: string) => `
    <html><head><title>ESA</title></head>
    <body>
      <script>window.__CSRF="${token}"</script>
      <p>Footer generated at ${time}</p>
      <p>The award is ${amount} per student per year.</p>
      <img src="/logo.png?v=${token}">
    </body></html>`;

  it("gives the same hash when only the noise moved", () => {
    expect(fp(page("a1b2c3d4e5f60718", "3:42 PM", "$7,000"))).toBe(
      fp(page("ffeeddccbbaa9988", "11:05 AM", "$7,000"))
    );
  });

  it("gives a different hash the moment the award changes", () => {
    expect(fp(page("a1b2c3d4e5f60718", "3:42 PM", "$7,000"))).not.toBe(
      fp(page("a1b2c3d4e5f60718", "3:42 PM", "$7,600"))
    );
  });

  it("produces a stable sha256 hex digest", () => {
    expect(hashText("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("summarizeChange", () => {
  it("treats a first sighting as a full change", () => {
    const c = summarizeChange(null, "hello world");
    expect(c.changed).toBe(true);
    expect(c.magnitude).toBe(1);
  });

  it("reports no change for identical text", () => {
    expect(summarizeChange("same text", "same text")).toEqual({ changed: false, delta: 0, magnitude: 0 });
  });

  it("scores a one-word edit as small and a rewrite as large", () => {
    const words = Array.from({ length: 100 }, (_, i) => `w${i}`).join(" ");
    const small = summarizeChange(words, words.replace("w50", "w999"));
    const large = summarizeChange(words, Array.from({ length: 100 }, (_, i) => `z${i}`).join(" "));
    expect(small.magnitude).toBeLessThan(0.05);
    expect(large.magnitude).toBeGreaterThan(0.9);
  });

  it("signs the delta so a page collapsing to nothing is visible", () => {
    expect(summarizeChange("a".repeat(5000), "gone").delta).toBeLessThan(0);
  });
});

describe("shouldEscalate — the gate in front of the expensive step", () => {
  const words = Array.from({ length: 500 }, (_, i) => `w${i}`).join(" ");

  it("never escalates when nothing changed", () => {
    expect(shouldEscalate(summarizeChange(words, words), words.length)).toBe(false);
  });

  it("does not spend a model call on a typo-sized edit", () => {
    const c = summarizeChange(words, words.replace("w7", "w7a"));
    expect(shouldEscalate(c, words.length)).toBe(false);
  });

  it("escalates a substantial rewrite", () => {
    const after = words.split(" ").map((w, i) => (i % 4 === 0 ? `x${i}` : w)).join(" ");
    expect(shouldEscalate(summarizeChange(words, after), after.length)).toBe(true);
  });

  it("refuses to escalate a page that has collapsed — that is a fetch bug, not an edit", () => {
    // Otherwise a login wall or an error page gets summarised to the reviewer as
    // "the state deleted all its rules", which is worse than saying nothing.
    const c = summarizeChange(words, "Access denied");
    expect(c.changed).toBe(true);
    expect(shouldEscalate(c, "Access denied".length)).toBe(false);
  });
});
