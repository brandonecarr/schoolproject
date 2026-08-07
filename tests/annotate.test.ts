import { describe, it, expect } from "vitest";
import { isAnnotatable, toFraction, clamp01, numbered, pinStyle } from "@/lib/annotate";

describe("isAnnotatable", () => {
  it("accepts the image types a student can upload", () => {
    expect(isAnnotatable({ mime: "image/jpeg", ext: "jpg" })).toBe(true);
    expect(isAnnotatable({ mime: "image/png", ext: "png" })).toBe(true);
    expect(isAnnotatable({ mime: "image/webp", ext: "webp" })).toBe(true);
  });

  it("refuses PDFs — a pin needs to know where the page is on screen", () => {
    expect(isAnnotatable({ mime: "application/pdf", ext: "pdf" })).toBe(false);
  });

  it("falls back to the extension when the mime type is missing or odd", () => {
    expect(isAnnotatable({ mime: null, ext: "PNG" })).toBe(true);
    expect(isAnnotatable({ mime: "application/octet-stream", ext: "jpeg" })).toBe(true);
  });

  it("refuses nothing at all", () => {
    expect(isAnnotatable(null)).toBe(false);
    expect(isAnnotatable({ mime: null, ext: null })).toBe(false);
  });
});

describe("toFraction", () => {
  const box = { left: 100, top: 50, width: 400, height: 200 };

  it("converts a click to a fraction of the image, not pixels", () => {
    expect(toFraction({ x: 300, y: 150 }, box)).toEqual({ x: 0.5, y: 0.5 });
    expect(toFraction({ x: 100, y: 50 }, box)).toEqual({ x: 0, y: 0 });
    expect(toFraction({ x: 500, y: 250 }, box)).toEqual({ x: 1, y: 1 });
  });

  it("gives the same fraction whatever size the image is rendered at", () => {
    // The same photo is 320px in the grading queue and full-width on a phone.
    const small = toFraction({ x: 180, y: 90 }, { left: 100, top: 50, width: 160, height: 80 });
    const large = toFraction({ x: 260, y: 130 }, { left: 100, top: 50, width: 320, height: 160 });
    expect(small).toEqual(large);
  });

  it("clamps a click on the border back onto the image", () => {
    expect(toFraction({ x: 90, y: 40 }, box)).toEqual({ x: 0, y: 0 });
    expect(toFraction({ x: 510, y: 260 }, box)).toEqual({ x: 1, y: 1 });
  });

  it("returns null for an unlaid-out image instead of storing NaN", () => {
    // An <img> that hasn't loaded reports 0×0. Dividing by it stores NaN
    // happily and the pin then renders nowhere at all.
    expect(toFraction({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
    expect(toFraction({ x: 10, y: 10 }, { left: 0, top: 0, width: 400, height: 0 })).toBeNull();
  });
});

describe("clamp01", () => {
  it("holds the range", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(1.7)).toBe(1);
    expect(clamp01(0.42)).toBe(0.42);
  });

  it("turns NaN into a real number rather than propagating it", () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
  });
});

describe("numbered", () => {
  const p = (id: string, createdAt: string) => ({ id, x: 0.5, y: 0.5, createdAt });

  it("numbers by when the teacher wrote them, not by position", () => {
    // Re-sorting top-to-bottom would scramble a numbered explanation.
    const out = numbered([
      { id: "b", x: 0.1, y: 0.1, createdAt: "2026-08-02T00:00:00.000Z" },
      { id: "a", x: 0.9, y: 0.9, createdAt: "2026-08-01T00:00:00.000Z" },
    ]);
    expect(out.map((o) => [o.id, o.n])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("is stable when two pins share a timestamp", () => {
    const same = "2026-08-01T00:00:00.000Z";
    const first = numbered([p("z", same), p("a", same)]).map((o) => o.id);
    const again = numbered([p("a", same), p("z", same)]).map((o) => o.id);
    expect(first).toEqual(again);
    expect(first).toEqual(["a", "z"]);
  });

  it("does not mutate the input", () => {
    const input = [p("b", "2026-08-02T00:00:00.000Z"), p("a", "2026-08-01T00:00:00.000Z")];
    numbered(input);
    expect(input.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("handles an empty set", () => {
    expect(numbered([])).toEqual([]);
  });
});

describe("pinStyle", () => {
  it("emits percentages so the pin tracks the image at any size", () => {
    expect(pinStyle({ x: 0.25, y: 0.5 })).toEqual({ left: "25%", top: "50%" });
  });

  it("clamps corrupt stored values rather than rendering off-frame", () => {
    expect(pinStyle({ x: -3, y: 9 })).toEqual({ left: "0%", top: "100%" });
  });
});
