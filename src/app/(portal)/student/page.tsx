import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { periodStart, today } from "@/lib/dates";
import { computeAchievements } from "@/lib/achievements";
import { dueSoonForStudents, dueLabel } from "@/lib/due";
import { typeMeta } from "@/lib/lms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home — Cohort" };

export default async function StudentHomePage() {
  const { user } = await requireRole("student");
  const sid = user.studentId ?? "";

  const student = sid ? await prisma.student.findUnique({ where: { id: sid } }) : null;
  const [subsRaw, attendance, due] = await Promise.all([
    prisma.submission.findMany({ where: { studentId: sid } }),
    prisma.attendance.findMany({ where: { studentId: sid } }),
    dueSoonForStudents(sid ? [sid] : []),
  ]);
  const aIds = [...new Set(subsRaw.map((s) => s.assignmentId))];
  const assignments = await prisma.assignment.findMany({ where: { id: { in: aIds } } });
  const courses = await prisma.course.findMany({
    where: { id: { in: [...new Set(assignments.map((a) => a.courseId))] } },
  });
  const courseNameFor = (assignmentId: string) => {
    const a = assignments.find((x) => x.id === assignmentId);
    return courses.find((c) => c.id === a?.courseId)?.name || "—";
  };

  const { streak, badges } = computeAchievements({
    attendance,
    submissions: subsRaw.map((s) => ({
      status: s.status,
      score: s.score,
      points: assignments.find((a) => a.id === s.assignmentId)?.points ?? 0,
      courseName: courseNameFor(s.assignmentId),
    })),
  });

  const gradedSubs = subsRaw.filter((s) => s.status === "graded" && s.score != null);
  const gradedCount = gradedSubs.length;
  const turnedIn = subsRaw.filter((s) => s.status === "graded" || s.status === "submitted").length;
  const xp = gradedCount * 20 + turnedIn * 10 + streak * 5;
  const level = Math.floor(xp / 100) + 1;
  const pct = xp % 100;
  const firstName = (student ? student.name : user.name).split(" ")[0];

  const openCount = due.length;
  const returned = due.filter((d) => d.status === "returned");
  const presentDays = attendance.filter(
    (a) => a.status === "present" && a.date >= periodStart() && a.date <= today()
  ).length;

  // Average grade as a percentage across graded work.
  let avgPct: number | null = null;
  if (gradedCount > 0) {
    let earned = 0;
    let possible = 0;
    for (const s of gradedSubs) {
      const pts = assignments.find((a) => a.id === s.assignmentId)?.points ?? 0;
      earned += s.score ?? 0;
      possible += pts;
    }
    avgPct = possible > 0 ? Math.round((earned / possible) * 100) : null;
  }

  const recentFeedback = gradedSubs
    .filter((s) => s.feedback && s.feedback !== "Auto-graded." && s.feedback !== "Completed.")
    .slice(-3)
    .reverse();
  const titleOf = (assignmentId: string) =>
    assignments.find((a) => a.id === assignmentId)?.title ?? "—";

  return (
    <>
      {/* HUD */}
      <section className="hud">
        <div className="hud-avatar" aria-hidden>
          {firstName.charAt(0)}
        </div>
        <div className="hud-main">
          <div className="hud-name">Hi {firstName}!</div>
          <div className="hud-sub">
            {openCount
              ? `${openCount} ${openCount === 1 ? "thing" : "things"} to finish`
              : "You’re all caught up — nice!"}
          </div>
          <div className="xpbar">
            <div className="meta">
              <span>Level {level}</span>
              <span>{pct} / 100 XP</span>
            </div>
            <div className="track">
              <div className="fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <div className="hud-streak">
          <div className="big">🔥 {streak}</div>
          <div className="lbl">day streak</div>
        </div>
      </section>

      {/* quick stats */}
      <div className="stat-row" style={{ marginTop: 16 }}>
        <div className="stat-tile">
          <div className="n">{openCount}</div>
          <div className="l">To do</div>
        </div>
        <div className="stat-tile">
          <div className="n">{avgPct != null ? `${avgPct}%` : "—"}</div>
          <div className="l">Average grade</div>
        </div>
        <div className="stat-tile">
          <div className="n">{presentDays}</div>
          <div className="l">Days present</div>
        </div>
        <div className="stat-tile">
          <div className="n">{badges.filter((b) => b.earned).length}</div>
          <div className="l">Trophies</div>
        </div>
      </div>

      {returned.length > 0 && (
        <div className="notice bad" style={{ marginTop: 16 }}>
          <strong>{returned.length}</strong>{" "}
          {returned.length === 1 ? "assignment needs" : "assignments need"} changes from your teacher.{" "}
          <Link href="/student/work">Fix {returned.length === 1 ? "it" : "them"}</Link>.
        </div>
      )}

      {/* coming due soon */}
      <div className="spread" style={{ margin: "22px 2px 10px" }}>
        <div className="eyebrow" style={{ margin: 0 }}>
          Coming due soon
        </div>
        <Link className="small" href="/student/work">
          All my work →
        </Link>
      </div>
      {openCount === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Nothing due right now. 🎈
          </p>
        </div>
      ) : (
        <div className="due-list">
          {due.slice(0, 5).map((d) => {
            const m = typeMeta(d.type);
            const tone = d.daysLeft < 0 ? "bad" : d.daysLeft <= 1 ? "warn" : "info";
            return (
              <Link key={d.submissionId} href="/student/work" className={`due-row ${tone}`}>
                <span className="due-ic" aria-hidden>
                  {m.icon}
                </span>
                <span className="due-main">
                  <span className="due-title">{d.title}</span>
                  <span className="small muted">
                    {d.courseName} · {m.label}
                    {d.status === "returned" ? " · needs changes" : ""}
                  </span>
                </span>
                <span className={`due-when ${tone}`}>{dueLabel(d.daysLeft)}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* recent feedback */}
      {recentFeedback.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 22 }}>
            Recent feedback from your teacher
          </div>
          <div className="card" style={{ marginTop: 10, padding: "6px 18px" }}>
            {recentFeedback.map((s) => (
              <div key={s.id} style={{ padding: "13px 0", borderTop: "1px solid var(--rule)" }}>
                <div className="spread">
                  <strong>{titleOf(s.assignmentId)}</strong>
                  <span className="pill mark">
                    {s.score}/{assignments.find((a) => a.id === s.assignmentId)?.points ?? 0}
                  </span>
                </div>
                <p className="small muted" style={{ margin: "6px 0 0" }}>
                  {s.feedback}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* trophies */}
      <div className="spread" style={{ marginTop: 22 }}>
        <div className="eyebrow">Trophy case</div>
        <Link className="small" href="/student/portfolio">
          My portfolio →
        </Link>
      </div>
      <div className="trophy-grid" style={{ marginTop: 10 }}>
        {badges.map((b) => (
          <div key={b.key} className={`trophy ${b.earned ? "on" : ""}`} title={b.hint}>
            <span className="em">{b.emoji}</span>
            <span className="nm">{b.label}</span>
            <span className="hn">{b.earned ? "Earned" : b.hint}</span>
          </div>
        ))}
      </div>
    </>
  );
}
