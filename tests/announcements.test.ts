import { describe, it, expect } from "vitest";
import { canSee, sortForFamily, needsAck, excerpt, AUDIENCES } from "@/lib/announcements";

const a = (o: Partial<Parameters<typeof canSee>[0]> = {}) => ({
  id: "a1",
  audience: "all",
  pinned: false,
  publishedAt: "2026-08-01T00:00:00.000Z",
  ...o,
});

describe("canSee — drafts and audience", () => {
  it("hides a draft from every family role", () => {
    // The single most important rule here: an unpublished note must not leak.
    const draft = a({ publishedAt: null });
    for (const role of ["parent", "student", "anything-else"]) {
      expect(canSee(draft, role), role).toBe(false);
    }
  });

  it("shows drafts to staff, who wrote them", () => {
    expect(canSee(a({ publishedAt: null }), "owner")).toBe(true);
    expect(canSee(a({ publishedAt: null }), "teacher")).toBe(true);
  });

  it("routes each audience to the right role", () => {
    expect(canSee(a({ audience: "parents" }), "parent")).toBe(true);
    expect(canSee(a({ audience: "parents" }), "student")).toBe(false);
    expect(canSee(a({ audience: "students" }), "student")).toBe(true);
    expect(canSee(a({ audience: "students" }), "parent")).toBe(false);
    expect(canSee(a({ audience: "all" }), "parent")).toBe(true);
    expect(canSee(a({ audience: "all" }), "student")).toBe(true);
  });

  it("fails closed on an unrecognised audience", () => {
    // A typo in the column must hide the notice, never widen it.
    expect(canSee(a({ audience: "gaurdians" }), "parent")).toBe(false);
    expect(canSee(a({ audience: "" }), "student")).toBe(false);
  });

  it("checks published before audience, so a targeted draft is still hidden", () => {
    expect(canSee(a({ audience: "parents", publishedAt: null }), "parent")).toBe(false);
  });
});

describe("sortForFamily", () => {
  it("puts pinned items first regardless of date", () => {
    const out = sortForFamily([
      a({ id: "new", publishedAt: "2026-08-05T00:00:00.000Z" }),
      a({ id: "pin", pinned: true, publishedAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["pin", "new"]);
  });

  it("orders by publication, not authorship", () => {
    // Drafted in January, published in August — it belongs at the top now.
    const out = sortForFamily([
      a({ id: "aug", publishedAt: "2026-08-05T00:00:00.000Z" }),
      a({ id: "sep", publishedAt: "2026-09-01T00:00:00.000Z" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["sep", "aug"]);
  });

  it("does not mutate the input", () => {
    const input = [a({ id: "x" }), a({ id: "y", pinned: true })];
    sortForFamily(input);
    expect(input.map((i) => i.id)).toEqual(["x", "y"]);
  });
});

describe("needsAck", () => {
  const items = [
    { ...a({ id: "needs", audience: "parents" }), requireAck: true },
    { ...a({ id: "optional" }), requireAck: false },
    { ...a({ id: "done" }), requireAck: true },
    { ...a({ id: "draft", publishedAt: null }), requireAck: true },
    { ...a({ id: "notmine", audience: "students" }), requireAck: true },
  ];

  it("returns only what this reader still owes", () => {
    expect(needsAck(items, "parent", new Set(["done"])).map((x) => x.id)).toEqual(["needs"]);
  });

  it("never asks staff to acknowledge their own notice", () => {
    expect(needsAck(items, "owner", new Set())).toEqual([]);
  });

  it("never counts a draft or another audience's notice", () => {
    const ids = needsAck(items, "parent", new Set()).map((x) => x.id);
    expect(ids).not.toContain("draft");
    expect(ids).not.toContain("notmine");
  });
});

describe("excerpt", () => {
  it("flattens markdown into a readable one-liner", () => {
    expect(excerpt("## Closure\n\nWe are **closed** on [Friday](https://x.test).")).toBe(
      "Closure We are closed on Friday."
    );
  });

  it("truncates on a boundary with an ellipsis", () => {
    const out = excerpt("x".repeat(200), 50);
    expect(out).toHaveLength(50);
    expect(out.endsWith("…")).toBe(true);
  });

  it("leaves a short body alone", () => {
    expect(excerpt("Short note")).toBe("Short note");
    expect(excerpt("")).toBe("");
  });
});

describe("AUDIENCES", () => {
  it("offers exactly the values canSee understands", () => {
    for (const opt of AUDIENCES) {
      expect(canSee(a({ audience: opt.value }), "parent") || canSee(a({ audience: opt.value }), "student")).toBe(true);
    }
    expect(AUDIENCES.map((x) => x.value)).toEqual(["all", "parents", "students"]);
  });
});
