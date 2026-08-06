import { describe, it, expect } from "vitest";
import {
  buildModuleStates,
  itemComplete,
  overallProgress,
  type ModuleLike,
  type ItemLike,
  type SubmissionLike,
} from "@/lib/modules";

const TODAY = "2026-08-06";

const mod = (id: string, position: number, over: Partial<ModuleLike> = {}): ModuleLike => ({
  id,
  name: id,
  description: "",
  position,
  published: true,
  unlockAt: "",
  requireSequential: false,
  prereqModuleId: null,
  courseId: null,
  ...over,
});

const item = (id: string, moduleId: string, position: number, over: Partial<ItemLike> = {}): ItemLike => ({
  id,
  moduleId,
  kind: "assignment",
  refId: `a_${id}`,
  title: id,
  position,
  required: true,
  minScore: null,
  ...over,
});

const sub = (assignmentId: string, status: string, score: number | null = null): SubmissionLike => ({
  assignmentId,
  status,
  score,
});

describe("itemComplete", () => {
  const pages = new Set<string>();

  it("headers are always complete — there is nothing to do", () => {
    expect(itemComplete(item("h", "m1", 0, { kind: "header" }), [], pages)).toBe(true);
  });

  it("a page is complete only once it has been recorded as read", () => {
    const p = item("p1", "m1", 0, { kind: "page" });
    expect(itemComplete(p, [], new Set())).toBe(false);
    expect(itemComplete(p, [], new Set(["p1"]))).toBe(true);
  });

  it("an assignment is complete when its submission is graded", () => {
    const a = item("i1", "m1", 0);
    expect(itemComplete(a, [sub("a_i1", "submitted")], pages)).toBe(false);
    expect(itemComplete(a, [sub("a_i1", "graded", 8)], pages)).toBe(true);
  });

  it("respects minScore when set", () => {
    const a = item("i1", "m1", 0, { minScore: 8 });
    expect(itemComplete(a, [sub("a_i1", "graded", 7)], pages)).toBe(false);
    expect(itemComplete(a, [sub("a_i1", "graded", 8)], pages)).toBe(true);
  });

  it("is false when the student has no submission at all", () => {
    expect(itemComplete(item("i1", "m1", 0), [], pages)).toBe(false);
  });
});

describe("module completion", () => {
  it("counts only required, non-header items", () => {
    const modules = [mod("m1", 0)];
    const items = [
      item("h", "m1", 0, { kind: "header" }),
      item("i1", "m1", 1),
      item("i2", "m1", 2, { required: false }),
    ];
    const [st] = buildModuleStates({
      modules,
      items,
      submissions: [sub("a_i1", "graded", 10)],
      pageDoneIds: new Set(),
      today: TODAY,
    });
    expect(st.requiredTotal).toBe(1);
    expect(st.requiredDone).toBe(1);
    expect(st.complete).toBe(true);
    expect(st.pct).toBe(100);
  });

  it("is incomplete while any required item is outstanding", () => {
    const [st] = buildModuleStates({
      modules: [mod("m1", 0)],
      items: [item("i1", "m1", 0), item("i2", "m1", 1)],
      submissions: [sub("a_i1", "graded", 10)],
      pageDoneIds: new Set(),
      today: TODAY,
    });
    expect(st.complete).toBe(false);
    expect(st.pct).toBe(50);
  });
});

describe("locking", () => {
  it("locks a module until its unlock date", () => {
    const [st] = buildModuleStates({
      modules: [mod("m1", 0, { unlockAt: "2026-09-01" })],
      items: [item("i1", "m1", 0)],
      submissions: [],
      pageDoneIds: new Set(),
      today: TODAY,
    });
    expect(st.locked).toBe(true);
    expect(st.lockReason).toContain("Opens");
    expect(st.items[0].locked).toBe(true);
  });

  it("opens a module once its unlock date has passed", () => {
    const [st] = buildModuleStates({
      modules: [mod("m1", 0, { unlockAt: "2026-08-01" })],
      items: [item("i1", "m1", 0)],
      submissions: [],
      pageDoneIds: new Set(),
      today: TODAY,
    });
    expect(st.locked).toBe(false);
  });

  it("locks a module until its prerequisite is complete, then releases it", () => {
    const modules = [mod("m1", 0), mod("m2", 1, { prereqModuleId: "m1" })];
    const items = [item("i1", "m1", 0), item("i2", "m2", 0)];

    const before = buildModuleStates({
      modules,
      items,
      submissions: [],
      pageDoneIds: new Set(),
      today: TODAY,
    });
    expect(before[1].locked).toBe(true);
    expect(before[1].lockReason).toContain("m1");

    const after = buildModuleStates({
      modules,
      items,
      submissions: [sub("a_i1", "graded", 10)],
      pageDoneIds: new Set(),
      today: TODAY,
    });
    expect(after[1].locked).toBe(false);
  });

  it("sequential modules open one required item at a time", () => {
    const [st] = buildModuleStates({
      modules: [mod("m1", 0, { requireSequential: true })],
      items: [item("i1", "m1", 0), item("i2", "m1", 1), item("i3", "m1", 2)],
      submissions: [],
      pageDoneIds: new Set(),
      today: TODAY,
    });
    expect(st.items[0].locked).toBe(false); // open
    expect(st.items[1].locked).toBe(true);
    expect(st.items[2].locked).toBe(true);
  });

  it("sequential unlocks the next item as work is completed", () => {
    const [st] = buildModuleStates({
      modules: [mod("m1", 0, { requireSequential: true })],
      items: [item("i1", "m1", 0), item("i2", "m1", 1), item("i3", "m1", 2)],
      submissions: [sub("a_i1", "graded", 10)],
      pageDoneIds: new Set(),
      today: TODAY,
    });
    expect(st.items[0].locked).toBe(false);
    expect(st.items[1].locked).toBe(false); // now open
    expect(st.items[2].locked).toBe(true);
  });

  it("non-sequential modules leave every item open", () => {
    const [st] = buildModuleStates({
      modules: [mod("m1", 0)],
      items: [item("i1", "m1", 0), item("i2", "m1", 1)],
      submissions: [],
      pageDoneIds: new Set(),
      today: TODAY,
    });
    expect(st.items.every((i) => !i.locked)).toBe(true);
  });

  it("teachers see everything unlocked — they are authoring it", () => {
    const [st] = buildModuleStates({
      modules: [mod("m1", 0, { unlockAt: "2099-01-01", requireSequential: true })],
      items: [item("i1", "m1", 0), item("i2", "m1", 1)],
      submissions: [],
      pageDoneIds: new Set(),
      today: TODAY,
      isTeacher: true,
    });
    expect(st.locked).toBe(false);
    expect(st.items.every((i) => !i.locked)).toBe(true);
  });

  it("returns modules in position order", () => {
    const states = buildModuleStates({
      modules: [mod("b", 2), mod("a", 1)],
      items: [],
      submissions: [],
      pageDoneIds: new Set(),
      today: TODAY,
    });
    expect(states.map((s) => s.module.id)).toEqual(["a", "b"]);
  });
});

describe("overallProgress", () => {
  it("sums required items across modules", () => {
    const states = buildModuleStates({
      modules: [mod("m1", 0), mod("m2", 1)],
      items: [item("i1", "m1", 0), item("i2", "m1", 1), item("i3", "m2", 0)],
      submissions: [sub("a_i1", "graded", 5)],
      pageDoneIds: new Set(),
      today: TODAY,
    });
    expect(overallProgress(states)).toEqual({ done: 1, total: 3, pct: 33 });
  });
});
