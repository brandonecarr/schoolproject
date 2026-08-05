// Achievements + streaks — light, age-appropriate gamification for the student
// portal. Everything is DERIVED from existing data (attendance + submissions),
// so there's no state to keep in sync and nothing can be gamed.

export type AchievementInput = {
  attendance: { date: string; status: string }[];
  submissions: { status: string; score: number | null; points: number; courseName: string }[];
};

export type Stat = { label: string; value: string };

export type Badge = {
  key: string;
  emoji: string;
  label: string;
  hint: string; // how to earn it (shown whether locked or earned)
  earned: boolean;
};

export type AchievementResult = {
  streak: number; // current consecutive present days
  stats: Stat[];
  badges: Badge[];
};

// Consecutive "present" days counting back from the most recent logged day.
export function currentStreak(attendance: { date: string; status: string }[]): number {
  const byDateDesc = [...attendance].sort((a, b) => (a.date < b.date ? 1 : -1));
  let streak = 0;
  for (const a of byDateDesc) {
    if (a.status === "present") streak++;
    else break;
  }
  return streak;
}

export function computeAchievements(input: AchievementInput): AchievementResult {
  const { attendance, submissions } = input;

  const streak = currentStreak(attendance);
  const turnedIn = submissions.filter((s) => s.status === "graded" || s.status === "submitted").length;
  const graded = submissions.filter((s) => s.status === "graded");
  const perfect = graded.filter((s) => s.score != null && s.points > 0 && s.score >= s.points).length;
  const distinctSubjects = new Set(graded.map((s) => s.courseName)).size;
  const scored = graded.filter((s) => s.score != null && s.points > 0);
  const avgPct = scored.length
    ? Math.round((scored.reduce((a, s) => a + (s.score as number) / s.points, 0) / scored.length) * 100)
    : 0;

  const stats: Stat[] = [
    { label: "Day streak", value: String(streak) },
    { label: "Turned in", value: String(turnedIn) },
    { label: "Graded", value: String(graded.length) },
    { label: "Avg score", value: scored.length ? `${avgPct}%` : "—" },
  ];

  const badges: Badge[] = [
    {
      key: "first_turnin",
      emoji: "✏️",
      label: "First turn-in",
      hint: "Turn in your first assignment",
      earned: turnedIn >= 1,
    },
    {
      key: "streak5",
      emoji: "🔥",
      label: "On a roll",
      hint: "5-day attendance streak",
      earned: streak >= 5,
    },
    {
      key: "perfect",
      emoji: "⭐",
      label: "Perfect score",
      hint: "Get full marks on an assignment",
      earned: perfect >= 1,
    },
    {
      key: "well_rounded",
      emoji: "🧭",
      label: "Well-rounded",
      hint: "Graded work in 3 different subjects",
      earned: distinctSubjects >= 3,
    },
    {
      key: "ten_down",
      emoji: "🏅",
      label: "Ten down",
      hint: "Get 10 assignments graded",
      earned: graded.length >= 10,
    },
    {
      key: "sharp",
      emoji: "🎯",
      label: "Sharp shooter",
      hint: "Keep a 90%+ average",
      earned: scored.length >= 3 && avgPct >= 90,
    },
  ];

  return { streak, stats, badges };
}
