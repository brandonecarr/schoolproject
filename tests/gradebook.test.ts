import { describe, it, expect } from "vitest";
import {
  buildRow,
  letterFor,
  cellStatus,
  isLate,
  assignmentAverage,
  type AssignmentInput,
  type CellInput,
} from "@/lib/gradebook";

const TODAY = "2026-08-06";

const asg = (id: string, points: number, dueDate: string): AssignmentInput => ({
  id,
  title: id,
  points,
  dueDate,
  courseId: "c1",
  type: "written",
});

const cell = (
  assignmentId: string,
  status: string,
  score: number | null,
  submittedAt: string | null = null
): CellInput => ({
  submissionId: `s_${assignmentId}`,
  studentId: "stu1",
  assignmentId,
  status,
  score,
  submittedAt,
});

describe("letterFor", () => {
  it("maps percentages to the default scale", () => {
    expect(letterFor(0.95)).toBe("A");
    expect(letterFor(0.9)).toBe("A");
    expect(letterFor(0.89)).toBe("B");
    expect(letterFor(0.7)).toBe("C");
    expect(letterFor(0.61)).toBe("D");
    expect(letterFor(0.2)).toBe("F");
  });
  it("shows a dash when there is nothing to grade", () => {
    expect(letterFor(null)).toBe("—");
  });
});

describe("cellStatus", () => {
  it("flags unturned work as missing only once it is past due", () => {
    expect(cellStatus(cell("a", "assigned", null), "2026-08-01", TODAY)).toBe("missing");
    expect(cellStatus(cell("a", "assigned", null), "2026-08-20", TODAY)).toBe("assigned");
  });
  it("treats an unfinished draft past due as missing", () => {
    expect(cellStatus(cell("a", "draft", null), "2026-08-01", TODAY)).toBe("missing");
    expect(cellStatus(cell("a", "draft", null), "2026-08-20", TODAY)).toBe("draft");
  });
  it("passes through graded, submitted, and returned", () => {
    expect(cellStatus(cell("a", "graded", 9), "2026-08-01", TODAY)).toBe("graded");
    expect(cellStatus(cell("a", "submitted", null), "2026-08-01", TODAY)).toBe("submitted");
    expect(cellStatus(cell("a", "returned", null), "2026-08-01", TODAY)).toBe("returned");
  });
});

describe("isLate", () => {
  it("compares the submission date to the due date", () => {
    expect(isLate("2026-08-05T10:00:00Z", "2026-08-04")).toBe(true);
    expect(isLate("2026-08-04T10:00:00Z", "2026-08-04")).toBe(false);
    expect(isLate(null, "2026-08-04")).toBe(false);
  });
});

describe("buildRow", () => {
  const assignments = [asg("a1", 10, "2026-08-01"), asg("a2", 20, "2026-08-02"), asg("a3", 10, "2026-08-20")];

  it("grades on graded work only — ungraded work never drags the average down", () => {
    const row = buildRow(
      "stu1",
      assignments,
      [cell("a1", "graded", 9), cell("a2", "submitted", null), cell("a3", "assigned", null)],
      TODAY
    );
    expect(row.earned).toBe(9);
    expect(row.possible).toBe(10); // only a1 counted
    expect(row.pct).toBeCloseTo(0.9);
    expect(row.letter).toBe("A");
    expect(row.gradedCount).toBe(1);
  });

  it("counts past-due unturned work as missing without zeroing the grade", () => {
    const row = buildRow(
      "stu1",
      assignments,
      [cell("a1", "graded", 10), cell("a2", "assigned", null), cell("a3", "assigned", null)],
      TODAY
    );
    expect(row.missingCount).toBe(1); // a2 past due; a3 not due yet
    expect(row.pct).toBe(1);
    expect(row.letter).toBe("A");
  });

  it("has no percentage before anything is graded", () => {
    const row = buildRow("stu1", assignments, [cell("a1", "submitted", null)], TODAY);
    expect(row.pct).toBeNull();
    expect(row.letter).toBe("—");
  });

  it("emits a cell per assignment even when work was never assigned to the student", () => {
    const row = buildRow("stu1", assignments, [cell("a1", "graded", 5)], TODAY);
    expect(row.cells).toHaveLength(3);
    expect(row.cells[1].submissionId).toBe("");
  });

  it("marks a late submission", () => {
    const row = buildRow("stu1", [asg("a1", 10, "2026-08-01")], [cell("a1", "graded", 8, "2026-08-03T09:00:00Z")], TODAY);
    expect(row.cells[0].late).toBe(true);
  });
});

describe("assignmentAverage", () => {
  it("averages graded cells only", () => {
    const assignments = [asg("a1", 10, "2026-08-01")];
    const rows = [
      buildRow("stu1", assignments, [{ ...cell("a1", "graded", 10), studentId: "stu1" }], TODAY),
      buildRow("stu2", assignments, [{ ...cell("a1", "graded", 6), studentId: "stu2" }], TODAY),
      buildRow("stu3", assignments, [{ ...cell("a1", "submitted", null), studentId: "stu3" }], TODAY),
    ];
    expect(assignmentAverage("a1", rows)).toBeCloseTo(0.8); // (1.0 + 0.6) / 2
  });
  it("is null when nothing is graded", () => {
    const assignments = [asg("a1", 10, "2026-08-01")];
    const rows = [buildRow("stu1", assignments, [{ ...cell("a1", "submitted", null), studentId: "stu1" }], TODAY)];
    expect(assignmentAverage("a1", rows)).toBeNull();
  });
});
