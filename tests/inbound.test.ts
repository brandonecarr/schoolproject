// The inbound email pipe: signature verification is the security boundary
// (anyone on the internet can POST to the webhook URL), and the forwarded
// copy is what the operator actually reads.

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyWebhook, composeForward, WEBHOOK_TOLERANCE_SECONDS } from "@/lib/inbound";

const SECRET_BYTES = Buffer.from("test-secret-material-32-bytes!!!");
const SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;

function sign(id: string, timestamp: string, body: string): string {
  const sig = createHmac("sha256", SECRET_BYTES).update(`${id}.${timestamp}.${body}`).digest("base64");
  return `v1,${sig}`;
}

describe("verifyWebhook", () => {
  const now = 1_700_000_000;
  const base = { secret: SECRET, id: "msg_1", timestamp: String(now), body: '{"a":1}', nowSeconds: now };

  it("accepts a correctly signed payload", () => {
    expect(verifyWebhook({ ...base, signature: sign("msg_1", String(now), '{"a":1}') })).toBe(true);
  });

  it("accepts when a valid v1 entry sits among others", () => {
    const good = sign("msg_1", String(now), '{"a":1}');
    expect(verifyWebhook({ ...base, signature: `v1,AAAA ${good}` })).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyWebhook({ ...base, body: '{"a":2}', signature: sign("msg_1", String(now), '{"a":1}') })).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const otherKey = Buffer.from("a-completely-different-secret!!!");
    const sig = createHmac("sha256", otherKey).update(`msg_1.${now}.{"a":1}`).digest("base64");
    expect(verifyWebhook({ ...base, signature: `v1,${sig}` })).toBe(false);
  });

  it("rejects a stale timestamp — replay guard", () => {
    const old = String(now - WEBHOOK_TOLERANCE_SECONDS - 1);
    expect(
      verifyWebhook({ ...base, timestamp: old, signature: sign("msg_1", old, '{"a":1}') })
    ).toBe(false);
  });

  it("rejects an empty or garbage signature header", () => {
    expect(verifyWebhook({ ...base, signature: "" })).toBe(false);
    expect(verifyWebhook({ ...base, signature: "v0,zzzz notasig" })).toBe(false);
  });
});

describe("composeForward", () => {
  const mail = {
    from: "A Parent <parent@example.com>",
    to: ["info@schoolcohort.com"],
    subject: "Question about signing in",
    text: "Hi — I lost the link.",
    html: null,
    created_at: "2026-08-08T12:00:00Z",
    attachments: [{ filename: "award-letter.pdf", content_type: "application/pdf", size: 1234 }],
  };

  it("carries sender, recipient, body and attachment names", () => {
    const fwd = composeForward(mail);
    expect(fwd.subject).toBe("Fwd: Question about signing in");
    expect(fwd.text).toContain("parent@example.com");
    expect(fwd.text).toContain("info@schoolcohort.com");
    expect(fwd.text).toContain("I lost the link");
    expect(fwd.text).toContain("award-letter.pdf");
  });

  it("falls back to stripped html, and never renders it", () => {
    const fwd = composeForward({ ...mail, text: null, html: "<p>Hello <b>there</b></p><script>x()</script>" });
    expect(fwd.text).toContain("Hello there");
    expect(fwd.text).not.toContain("<p>");
    expect(fwd.text).not.toContain("script");
  });

  it("survives an empty message", () => {
    const fwd = composeForward({ ...mail, text: null, html: null, subject: "", attachments: [] });
    expect(fwd.subject).toBe("Fwd: (no subject)");
    expect(fwd.text).toContain("(no body)");
  });
});

describe("the route's contract", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/email/inbound/route.ts"), "utf8");

  it("refuses to run without the webhook secret", () => {
    expect(route).toContain("RESEND_WEBHOOK_SECRET");
    expect(route).toContain("503");
  });

  it("verifies the signature against the RAW body before parsing", () => {
    expect(route.indexOf("request.text()")).toBeLessThan(route.indexOf("JSON.parse"));
    expect(route.indexOf("verifyWebhook")).toBeLessThan(route.indexOf("JSON.parse"));
  });

  it("guards against forwarding its own sender", () => {
    expect(route).toContain("own sender");
  });
});
