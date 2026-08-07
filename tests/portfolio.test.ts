import { describe, it, expect } from "vitest";
import { ordered, move, renumber, nextPosition, defaultTitle, reflectionGap } from "@/lib/portfolio";

const list = (...ids: string[]) => ids.map((id, i) => ({ id, position: i }));
const ids = (items: { id: string }[]) => items.map((x) => x.id);

describe("ordered", () => {
  it("sorts by position", () => {
    expect(ids(ordered([{ id: "c", position: 2 }, { id: "a", position: 0 }, { id: "b", position: 1 }]))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("is stable when positions collide", () => {
    // Duplicate positions happen after deletes; the order must not flicker.
    const dup = [{ id: "b", position: 1 }, { id: "a", position: 1 }];
    expect(ids(ordered(dup))).toEqual(ids(ordered([...dup].reverse())));
  });

  it("does not mutate the input", () => {
    const input = [{ id: "b", position: 1 }, { id: "a", position: 0 }];
    ordered(input);
    expect(ids(input)).toEqual(["b", "a"]);
  });
});

describe("move", () => {
  it("moves an entry up one place", () => {
    expect(ids(move(list("a", "b", "c"), "b", "up"))).toEqual(["b", "a", "c"]);
  });

  it("moves an entry down one place", () => {
    expect(ids(move(list("a", "b", "c"), "b", "down"))).toEqual(["a", "c", "b"]);
  });

  it("never loses or duplicates an entry, whatever the move", () => {
    // The property that matters: this is a child's chosen collection.
    const start = list("a", "b", "c", "d");
    for (const id of ["a", "b", "c", "d", "missing"]) {
      for (const dir of ["up", "down"] as const) {
        const out = move(start, id, dir);
        expect(out).toHaveLength(4);
        expect([...ids(out)].sort()).toEqual(["a", "b", "c", "d"]);
      }
    }
  });

  it("is a no-op at the boundaries rather than wrapping around", () => {
    expect(ids(move(list("a", "b", "c"), "a", "up"))).toEqual(["a", "b", "c"]);
    expect(ids(move(list("a", "b", "c"), "c", "down"))).toEqual(["a", "b", "c"]);
  });

  it("always returns positions renumbered 0..n-1", () => {
    const out = move(list("a", "b", "c"), "c", "up");
    expect(out.map((x) => x.position)).toEqual([0, 1, 2]);
  });

  it("repairs a drifted sequence on the next move", () => {
    // After deletes, positions gap: 0, 5, 9. A move should tidy them.
    const drifted = [
      { id: "a", position: 0 },
      { id: "b", position: 5 },
      { id: "c", position: 9 },
    ];
    const out = move(drifted, "c", "up");
    expect(out.map((x) => x.position)).toEqual([0, 1, 2]);
    expect(ids(out)).toEqual(["a", "c", "b"]);
  });

  it("repairs drift even when the id is unknown", () => {
    const out = move([{ id: "a", position: 3 }, { id: "b", position: 7 }], "nope", "up");
    expect(out.map((x) => x.position)).toEqual([0, 1]);
  });

  it("handles a single entry and an empty list", () => {
    expect(ids(move(list("a"), "a", "up"))).toEqual(["a"]);
    expect(move([], "a", "down")).toEqual([]);
  });
});

describe("renumber", () => {
  it("rewrites positions in array order", () => {
    expect(renumber([{ id: "x", position: 9 }, { id: "y", position: 2 }])).toEqual([
      { id: "x", position: 0 },
      { id: "y", position: 1 },
    ]);
  });
});

describe("nextPosition", () => {
  it("puts a new piece at the end", () => {
    expect(nextPosition(list("a", "b", "c"))).toBe(3);
  });

  it("starts at zero for an empty portfolio", () => {
    expect(nextPosition([])).toBe(0);
  });

  it("clears a drifted maximum rather than colliding with it", () => {
    expect(nextPosition([{ id: "a", position: 0 }, { id: "b", position: 42 }])).toBe(43);
  });
});

describe("defaultTitle", () => {
  it("uses the assignment title, then the file label", () => {
    expect(defaultTitle({ assignmentTitle: "Volcano field notes" })).toBe("Volcano field notes");
    expect(defaultTitle({ label: "Leaf collection photo" })).toBe("Leaf collection photo");
  });

  it("never returns blank", () => {
    expect(defaultTitle({})).toBe("Untitled piece");
    expect(defaultTitle({ assignmentTitle: "   ", label: null })).toBe("Untitled piece");
  });
});

describe("reflectionGap", () => {
  it("counts entries the student hasn't written about yet", () => {
    expect(reflectionGap([{ reflection: "I learned…" }, { reflection: "" }, { reflection: "  " }])).toBe(2);
  });

  it("is zero for a finished portfolio", () => {
    expect(reflectionGap([{ reflection: "done" }])).toBe(0);
    expect(reflectionGap([])).toBe(0);
  });
});
