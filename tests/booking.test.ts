// The walkthrough booking flow and email blasts — the public edge of the
// admin console. What these hold: the race for a slot has exactly one winner,
// the public page can only ever see open future slots, and a blast cannot
// fire by accident.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const bookAction = read("src/app/book/actions.ts");
const bookPage = read("src/app/book/page.tsx");
const adminActions = read("src/app/cohort-admin/actions.ts");

describe("booking a slot", () => {
  it("claims atomically — updateMany guarded on leadId null and a future start", () => {
    expect(bookAction).toMatch(/updateMany\(\{\s*where: \{ id: slotId, leadId: null, startsAt: \{ gt/);
  });

  it("the race's loser is cleaned up and told to pick again", () => {
    const afterClaim = bookAction.slice(bookAction.indexOf("claimed.count === 0"));
    expect(afterClaim).toContain("lead.delete");
    expect(afterClaim).toContain("error=taken");
  });

  it("a booking is a lead, born scheduled from the walkthrough source", () => {
    expect(bookAction).toContain('source: "walkthrough"');
    expect(bookAction).toContain('status: "scheduled"');
  });

  it("the public page reads only open future slots", () => {
    expect(bookPage).toMatch(/where: \{ leadId: null, startsAt: \{ gt: new Date\(\) \} \}/);
  });

  it("the page is apex-only and the proxy serves it", () => {
    expect(bookPage).toContain('kind.kind !== "apex"');
    expect(read("src/proxy.ts")).toContain('"/book"');
  });

  it("the landing CTA now links to it", () => {
    expect(read("src/app/page.tsx")).toContain('href="/book"');
  });
});

describe("slot management stays humane", () => {
  it("only open slots can be deleted — a booked slot is an appointment", () => {
    expect(adminActions).toMatch(/walkthroughSlot\.deleteMany\(\{ where: \{ id, leadId: null \} \}/);
  });
});

describe("email blasts", () => {
  it("require an explicit confirmation to send", () => {
    expect(adminActions).toContain('formData.get("confirm") === "on"');
  });

  it("only known audiences exist", () => {
    expect(adminActions).toContain('"open_leads"');
    expect(adminActions).toContain('"all_leads"');
    expect(adminActions).toContain('"owners"');
    expect(adminActions).toContain("AUDIENCES.has(audience)");
  });

  it("every blast carries identity and an opt-out line", () => {
    expect(adminActions).toContain("schoolcohort.com");
    expect(adminActions).toMatch(/unsubscribe/i);
  });

  it("every blast is logged with its verbatim body", () => {
    expect(adminActions).toContain("emailBlast.create");
    expect(adminActions).toMatch(/data: \{ audience, subject, body, sentCount \}/);
  });
});

describe("the admin console is not indexed", () => {
  it("robots disallows /cohort-admin on the apex", () => {
    expect(read("src/app/robots.txt/route.ts")).toContain('"Disallow: /cohort-admin"');
  });
});
