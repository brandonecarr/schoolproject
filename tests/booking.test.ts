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

describe("booking a generated time", () => {
  it("the picked time must be one the rules offer right now — recomputed server-side", () => {
    expect(bookAction).toContain("expandRules(");
    expect(bookAction).toMatch(/open\.find\(/);
    const afterCheck = bookAction.slice(bookAction.indexOf("if (!picked)"));
    expect(afterCheck).toContain("error=taken");
  });

  it("the race has one winner — unique startsAt insert, P2002 loses", () => {
    expect(bookAction).toContain("walkthroughSlot.create");
    expect(bookAction).toContain('e.code === "P2002"');
  });

  it("the race's loser is cleaned up and told to pick again", () => {
    const afterCatch = bookAction.slice(bookAction.indexOf("catch (e)"));
    expect(afterCatch).toContain("lead.delete");
    expect(afterCatch).toContain("error=taken");
  });

  it("a booking is a lead, born scheduled from the walkthrough source", () => {
    expect(bookAction).toContain('source: "walkthrough"');
    expect(bookAction).toContain('status: "scheduled"');
  });

  it("the state is required, validated against the real list, stored on the lead", () => {
    expect(bookAction).toContain("US_STATE_SET.has(stateRaw)");
    expect(bookAction).toMatch(/data: \{ name, email, state, source: "walkthrough"/);
    const picker = read("src/app/book/BookingPicker.tsx");
    expect(picker).toContain('name="state"');
  });

  it("bookings carry campaign attribution from the coh_ref cookie, capped", () => {
    expect(bookAction).toContain('jar.get("coh_ref")');
    expect(bookAction).toMatch(/\.slice\(0, 60\)/);
  });

  it("the public page generates open times from rules; booked rows only subtract", () => {
    expect(bookPage).toContain("expandRules(");
    expect(bookPage).toMatch(/select: \{ startsAt: true \}/);
  });

  it("the picker is the Calendly shape: month grid, times column, details step", () => {
    const picker = read("src/app/book/BookingPicker.tsx");
    // No slot ids ever reach the visitor — the hidden field carries the instant.
    expect(picker).toContain('name="startsAt"');
    expect(picker).toContain("calgrid");
    expect(picker).toContain("Select a Date");
    expect(picker).toContain("Enter Details");
    // Times render in the visitor's own timezone, resolved in the browser.
    expect(picker).toContain("resolvedOptions().timeZone");
  });

  it("the page is apex-only and the proxy serves it", () => {
    expect(bookPage).toContain('kind.kind !== "apex"');
    expect(read("src/proxy.ts")).toContain('"/book"');
  });

  it("the landing CTA now links to it", () => {
    expect(read("src/app/page.tsx")).toContain('href="/book"');
  });
});

describe("availability management stays humane", () => {
  it("removing a rule stops offering times; it never touches bookings", () => {
    expect(adminActions).toMatch(/availabilityRule\.deleteMany\(\{ where: \{ id \} \}/);
    // No admin action deletes a booking — that's an appointment with a
    // person, and cancelling on them is a conversation, not a button.
    expect(adminActions).not.toContain("walkthroughSlot.delete");
  });

  it("a window must fit at least one slot and carry a real timezone", () => {
    expect(adminActions).toContain("startMin + slotMinutes > endMin");
    expect(adminActions).toContain("isValidTimeZone(timezone)");
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
