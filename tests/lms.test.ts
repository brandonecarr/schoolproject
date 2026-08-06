import { describe, it, expect } from "vitest";
import {
  autoScoreQuiz,
  assignmentMax,
  quizMax,
  rubricMax,
  itemIsAuto,
  isAutoComplete,
  parseItems,
  scoreItem,
  seededOrder,
  type Item,
} from "@/lib/lms";

const items: Item[] = [
  { id: "q1", kind: "mc", prompt: "3/4 + 1/4?", choices: ["1/2", "1", "4/8", "3/8"], answerIndex: 1, points: 2 },
  { id: "q2", kind: "tf", prompt: "1/2 > 1/3", answerIndex: 0, points: 1 },
  { id: "q3", kind: "fill", prompt: "2+2=", answer: "4", points: 1 },
  { id: "q4", kind: "short", prompt: "Explain.", points: 3 },
];

describe("autoScoreQuiz", () => {
  it("awards points for correct mc/tf/fill and leaves short answers manual", () => {
    const r = autoScoreQuiz(items, [
      { itemId: "q1", value: 1 }, // correct mc
      { itemId: "q2", value: 1 }, // wrong tf (picked False)
      { itemId: "q3", value: "4" }, // correct fill
      { itemId: "q4", value: "because" }, // short → manual, not auto
    ]);
    expect(r.auto).toBe(3); // 2 (mc) + 0 (tf wrong) + 1 (fill)
    expect(r.autoMax).toBe(4); // mc + tf + fill
    expect(r.manualMax).toBe(3); // the short answer
    expect(r.needsManual).toBe(true);
  });

  it("normalizes fill-in answers (case/space-insensitive)", () => {
    const fill: Item[] = [{ id: "f", kind: "fill", prompt: "capital?", answer: "Phoenix", points: 2 }];
    expect(autoScoreQuiz(fill, [{ itemId: "f", value: "  phoenix " }]).auto).toBe(2);
  });

  it("treats a keyless fill as manual, not auto-graded", () => {
    const fill: Item[] = [{ id: "f", kind: "fill", prompt: "open?", points: 2 }];
    expect(itemIsAuto(fill[0])).toBe(false);
    expect(autoScoreQuiz(fill, [{ itemId: "f", value: "anything" }]).needsManual).toBe(true);
  });
});

describe("point totals", () => {
  it("quizMax and rubricMax sum their parts", () => {
    expect(quizMax(items)).toBe(7);
    expect(rubricMax([{ id: "a", label: "x", max: 5 }, { id: "b", label: "y", max: 3 }])).toBe(8);
  });

  it("assignmentMax derives from config for quiz/rubric, else falls back to flat points", () => {
    expect(assignmentMax("quiz", JSON.stringify(items), 20)).toBe(7);
    expect(
      assignmentMax("rubric", JSON.stringify({ criteria: [{ id: "a", label: "x", max: 4 }] }), 20)
    ).toBe(4);
    expect(assignmentMax("written", "", 15)).toBe(15);
  });
});

describe("isAutoComplete", () => {
  it("check-offs always auto-complete; quizzes only without a manual item", () => {
    expect(isAutoComplete("checkoff")).toBe(true);
    expect(isAutoComplete("quiz", items)).toBe(false); // has a short answer
    expect(isAutoComplete("quiz", items.slice(0, 3))).toBe(true); // mc/tf/fill only
    expect(isAutoComplete("written")).toBe(false);
  });
});

describe("scoreItem — multi-select", () => {
  const multi: Item = {
    id: "m",
    kind: "multi",
    prompt: "Which are prime?",
    choices: ["2", "3", "4", "9"],
    answerIndices: [0, 1],
    points: 4,
  };

  it("gives full credit for the exact set", () => {
    expect(scoreItem(multi, [0, 1])).toBe(4);
    expect(scoreItem(multi, [1, 0])).toBe(4); // order is irrelevant
  });

  it("gives nothing for a missed or extra option — it is one judgement", () => {
    expect(scoreItem(multi, [0])).toBe(0);
    expect(scoreItem(multi, [0, 1, 2])).toBe(0);
  });

  it("ignores duplicates the UI might send", () => {
    expect(scoreItem(multi, [0, 0, 1])).toBe(4);
  });
});

describe("scoreItem — numeric", () => {
  const num: Item = { id: "n", kind: "numeric", prompt: "2.5 x 4", numAnswer: 10, tolerance: 0, points: 3 };

  it("accepts an exact answer", () => {
    expect(scoreItem(num, "10")).toBe(3);
    expect(scoreItem(num, "10.0")).toBe(3);
  });

  it("rejects a wrong answer", () => {
    expect(scoreItem(num, "9")).toBe(0);
  });

  it("honours tolerance for measurement-style answers", () => {
    const tol: Item = { ...num, tolerance: 0.5 };
    expect(scoreItem(tol, "9.6")).toBe(3);
    expect(scoreItem(tol, "10.5")).toBe(3);
    expect(scoreItem(tol, "10.6")).toBe(0);
  });

  it("scores nothing for blank or non-numeric input", () => {
    expect(scoreItem(num, "")).toBe(0);
    expect(scoreItem(num, "ten")).toBe(0);
  });
});

describe("scoreItem — matching (proportional)", () => {
  const match: Item = {
    id: "p",
    kind: "matching",
    prompt: "Match the term",
    pairs: [
      { left: "Magma", right: "Below ground" },
      { left: "Lava", right: "Above ground" },
      { left: "Crater", right: "The opening" },
      { left: "Vent", right: "The channel" },
    ],
    points: 8,
  };

  it("gives full credit when every pair is right", () => {
    expect(scoreItem(match, [0, 1, 2, 3])).toBe(8);
  });

  it("gives partial credit — four fifths right earns four fifths", () => {
    expect(scoreItem(match, [0, 1, 2, 0])).toBe(6); // 3 of 4 → 6 of 8
    expect(scoreItem(match, [0, 0, 0, 0])).toBe(2); // 1 of 4 → 2 of 8
  });

  it("gives nothing when nothing matches", () => {
    expect(scoreItem(match, [3, 2, 1, 0])).toBe(0);
  });
});

describe("scoreItem — ordering (proportional)", () => {
  const order: Item = {
    id: "o",
    kind: "ordering",
    prompt: "Order the steps",
    ordering: ["Melt", "Rise", "Erupt", "Cool"],
    points: 4,
  };

  it("gives full credit for the correct order", () => {
    expect(scoreItem(order, [0, 1, 2, 3])).toBe(4);
  });

  it("credits the positions that are right", () => {
    expect(scoreItem(order, [0, 1, 3, 2])).toBe(2); // first two correct
  });

  it("gives nothing for a fully reversed order", () => {
    expect(scoreItem(order, [3, 2, 1, 0])).toBe(0);
  });
});

describe("scoreItem — unanswered", () => {
  it("is always zero, whatever the kind", () => {
    const mc: Item = { id: "a", kind: "mc", prompt: "?", choices: ["x"], answerIndex: 0, points: 2 };
    expect(scoreItem(mc, undefined)).toBe(0);
    expect(scoreItem({ ...mc, kind: "multi", answerIndices: [0] }, [])).toBe(0);
    expect(scoreItem({ ...mc, kind: "numeric", numAnswer: 1 }, "")).toBe(0);
  });
});

describe("itemIsAuto — new kinds", () => {
  it("auto-grades multi, matching and ordering", () => {
    expect(itemIsAuto({ id: "1", kind: "multi", prompt: "", answerIndices: [0], points: 1 })).toBe(true);
    expect(itemIsAuto({ id: "2", kind: "matching", prompt: "", pairs: [], points: 1 })).toBe(true);
    expect(itemIsAuto({ id: "3", kind: "ordering", prompt: "", ordering: [], points: 1 })).toBe(true);
  });

  it("auto-grades numeric only when a value was supplied", () => {
    expect(itemIsAuto({ id: "4", kind: "numeric", prompt: "", numAnswer: 5, points: 1 })).toBe(true);
    expect(itemIsAuto({ id: "5", kind: "numeric", prompt: "", points: 1 })).toBe(false);
  });
});

describe("seededOrder", () => {
  it("is stable for the same seed — server and client must agree", () => {
    expect(seededOrder("item-42", 5)).toEqual(seededOrder("item-42", 5));
  });

  it("differs between items so every question isn't scrambled alike", () => {
    expect(seededOrder("a", 6)).not.toEqual(seededOrder("b", 6));
  });

  it("is a genuine permutation — nothing lost or duplicated", () => {
    const out = seededOrder("x", 7);
    expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("parseItems", () => {
  it("accepts a raw array or an {items} wrapper and ignores junk", () => {
    expect(parseItems(JSON.stringify(items))).toHaveLength(4);
    expect(parseItems(JSON.stringify({ items }))).toHaveLength(4);
    expect(parseItems("not json")).toEqual([]);
  });
});
