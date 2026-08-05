import { describe, it, expect } from "vitest";
import { computeAchievements, currentStreak } from "@/lib/achievements";

const att = (statuses: string[]) =>
  statuses.map((status, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, status }));

describe("currentStreak", () => {
  it("counts consecutive present days from the most recent", () => {
    // dates 01..05; most recent (05) present, 04 present, 03 absent → streak 2
    expect(currentStreak(att(["present", "present", "absent", "present", "present"]))).toBe(2);
  });
  it("is 0 when the most recent day is not present", () => {
    expect(currentStreak(att(["present", "present", "absent"]))).toBe(0);
  });
});

describe("computeAchievements", () => {
  it("earns the right badges from work + attendance", () => {
    const r = computeAchievements({
      attendance: att(["present", "present", "present", "present", "present"]), // streak 5
      submissions: [
        { status: "graded", score: 20, points: 20, courseName: "Math" }, // perfect
        { status: "graded", score: 14, points: 15, courseName: "ELA" },
        { status: "graded", score: 24, points: 25, courseName: "Science" }, // 3rd subject
        { status: "submitted", score: null, points: 10, courseName: "Math" },
      ],
    });
    const earned = new Set(r.badges.filter((b) => b.earned).map((b) => b.key));
    expect(r.streak).toBe(5);
    expect(earned.has("first_turnin")).toBe(true);
    expect(earned.has("streak5")).toBe(true);
    expect(earned.has("perfect")).toBe(true);
    expect(earned.has("well_rounded")).toBe(true); // 3 subjects
    expect(earned.has("ten_down")).toBe(false); // only 3 graded
  });

  it("handles a brand-new student with nothing yet", () => {
    const r = computeAchievements({ attendance: [], submissions: [] });
    expect(r.streak).toBe(0);
    expect(r.badges.every((b) => !b.earned)).toBe(true);
    expect(r.stats.find((s) => s.label === "Avg score")?.value).toBe("—");
  });
});
