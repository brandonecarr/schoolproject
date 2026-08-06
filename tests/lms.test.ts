import { describe, it, expect } from "vitest";
import {
  autoScoreQuiz,
  assignmentMax,
  quizMax,
  rubricMax,
  itemIsAuto,
  isAutoComplete,
  parseItems,
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

describe("parseItems", () => {
  it("accepts a raw array or an {items} wrapper and ignores junk", () => {
    expect(parseItems(JSON.stringify(items))).toHaveLength(4);
    expect(parseItems(JSON.stringify({ items }))).toHaveLength(4);
    expect(parseItems("not json")).toEqual([]);
  });
});
