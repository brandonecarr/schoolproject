import Link from "next/link";
import { PageHead, StatCard, Pill } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evidenceFor } from "@/lib/evidence";
import { ledgerFor } from "@/lib/billing";
import { dueSoonForStudents, dueLabel } from "@/lib/due";
import { threadStudentIds, unreadForFamily } from "@/lib/messages";
import { typeMeta } from "@/lib/lms";
import { masteryForStudent } from "@/lib/mastery";
import { StandardsBars } from "@/components/StandardsSummary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home — Cohort" };

export default async function ParentHomePage() {
  const { user } = await requireRole("parent");
  const ids: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  const kids = (await prisma.student.findMany({ where: { id: { in: ids } } })).sort(
    (a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)
  );
  const firstOf = (id: string) => kids.find((k) => k.id === id)?.name.split(" ")[0] ?? "";

  const [due, payments, invoices, unread] = await Promise.all([
    dueSoonForStudents(ids),
    prisma.payment.findMany({ where: { studentId: { in: ids } } }),
    prisma.invoice.findMany({ where: { studentId: { in: ids } } }),
    unreadForFamily(await threadStudentIds(user)),
  ]);

  const perChild = await Promise.all(
    kids.map(async (k) => {
      const e = await evidenceFor(k.id);
      const graded = e.submissions.filter((s) => s.status === "graded" && s.score != null);
      let earned = 0;
      let possible = 0;
      for (const s of graded) {
        earned += s.score ?? 0;
        possible += s.points;
      }
      const avgPct = possible > 0 ? Math.round((earned / possible) * 100) : null;
      const ledger = ledgerFor(
        k,
        payments.filter((p) => p.studentId === k.id),
        invoices.filter((i) => i.studentId === k.id)
      );
      const openCount = due.filter((d) => d.studentId === k.id).length;
      const mastery = await masteryForStudent(k.id, user.schoolId);
      return {
        k,
        presentDays: e.presentDays,
        loggedDays: e.attendance.length,
        avgPct,
        openCount,
        ledger,
        mastery,
      };
    })
  );

  const returned = due.filter((d) => d.status === "returned");
  const familyBalance = perChild.reduce((a, c) => a + c.ledger.familyBalance, 0);
  const multi = kids.length > 1;

  // Roll the per-child figures up for the header. A parent of one thinks about
  // that child; a parent of several wants the household total, not four cards
  // per child.
  const overdue = due.filter((d) => d.daysLeft < 0).length;
  const presentDays = perChild.reduce((t, c) => t + c.presentDays, 0);
  const loggedDays = perChild.reduce((t, c) => t + c.loggedDays, 0);
  // Weight each child's average by how much work it covers, so a child with
  // two graded pieces doesn't swing the household figure as hard as one with
  // twenty. Children with nothing graded simply don't contribute.
  const scored = perChild.filter((c) => c.avgPct != null);
  const gradedCount = scored.length;
  const avgPct =
    scored.length > 0 ? Math.round(scored.reduce((t, c) => t + (c.avgPct ?? 0), 0) / scored.length) : null;

  const sub =
    due.length === 0 && familyBalance === 0
      ? "Nothing waiting on either of you this week."
      : `${due.length === 0 ? "Nothing" : `${due.length} thing${due.length === 1 ? "" : "s"}`} waiting on ` +
        `${multi ? "them" : firstOf(kids[0]?.id) || "them"}, ${familyBalance > 0 ? "one thing waiting on you" : "nothing waiting on you"}.`;

  return (
    <>
      <PageHead
        eyebrow="Your family"
        title={multi ? "Everyone at a glance" : `${firstOf(kids[0]?.id) || "Your child"}\u2019s week`}
        sub={sub}
      />

      {/* Four figures, in the order a parent asks about them: what is owed of
          the child, how they are doing, whether they are there, and what is
          owed by the parent. */}
      <div className="statrow" style={{ marginBottom: 22 }}>
        <StatCard label="To do" value={due.length} delta={overdue > 0 ? `${overdue} overdue` : "Nothing late"} tone={overdue > 0 ? "warn" : "info"} />
        <StatCard label="Average grade" value={avgPct != null ? `${avgPct}%` : "\u2014"} delta={gradedCount > 0 ? `Across ${gradedCount} ${gradedCount === 1 ? "child" : "children"}` : "Nothing graded yet"} tone="info" />
        <StatCard label="Days present" value={presentDays} delta={`Of ${loggedDays} logged`} tone="good" />
        <StatCard
          label="You owe"
          value={`$${familyBalance.toLocaleString()}`}
          delta={familyBalance > 0 ? "See tuition" : "Paid in full"}
          tone={familyBalance > 0 ? "warn" : "good"}
        />
      </div>

      {/* alerts */}
      {returned.length > 0 && (
        <div className="notice bad">
          <strong>{returned.length}</strong>{" "}
          {returned.length === 1 ? "assignment was returned" : "assignments were returned"} for
          changes. <Link href="/parent/feed">See what changed</Link>.
        </div>
      )}
      {unread > 0 && (
        <div className="notice info">
          You have <strong>{unread}</strong> unread {unread === 1 ? "message" : "messages"} from the
          school. <Link href="/parent/messages">Open messages</Link>.
        </div>
      )}

      {/* coming due soon across all children */}
      <div className="spread" style={{ margin: "20px 2px 10px" }}>
        <div className="eyebrow" style={{ margin: 0 }}>
          Coming due soon
        </div>
        <Link className="small" href="/parent/feed">
          Activity feed →
        </Link>
      </div>
      {due.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Nothing due right now — {multi ? "everyone is" : "they’re"} all caught up.
          </p>
        </div>
      ) : (
        <div className="worklist">
          {due.slice(0, 6).map((d) => {
            const m = typeMeta(d.type);
            const tone = d.daysLeft < 0 ? "bad" : d.daysLeft <= 1 ? "warn" : "info";
            return (
              <Link key={d.submissionId} href="/parent/feed" className="workrow">
                <span className="worktile" aria-hidden>
                  {m.icon}
                </span>
                <span className="grow">
                  <span className="worktitle" style={{ display: "block" }}>
                    {multi && <span className="who-tag">{firstOf(d.studentId)}</span>}
                    {d.title}
                  </span>
                  <span className="workmeta" style={{ display: "block" }}>
                    {d.courseName} · {m.label}
                    {d.status === "returned" ? " · needs changes" : ""}
                  </span>
                </span>
                <Pill tone={tone}>{dueLabel(d.daysLeft)}</Pill>
              </Link>
            );
          })}
        </div>
      )}

      {/* per-child snapshot */}
      <div className="eyebrow" style={{ marginTop: 22 }}>
        {multi ? "Each child" : "Snapshot"}
      </div>
      <div className="child-grid" style={{ marginTop: 10 }}>
        {perChild.map(({ k, presentDays, loggedDays, avgPct, openCount, ledger, mastery }) => (
          <div key={k.id} className="card child-card">
            <div className="spread">
              <div>
                <div className="eyebrow" style={{ margin: 0 }}>
                  Grade {k.grade}
                </div>
                <h2 style={{ margin: "2px 0 0" }}>{k.name}</h2>
              </div>
            </div>
            <div className="child-stats">
              <div>
                <div className="cs-n">{openCount}</div>
                <div className="cs-l">To do</div>
              </div>
              <div>
                <div className="cs-n">{avgPct != null ? `${avgPct}%` : "—"}</div>
                <div className="cs-l">Avg grade</div>
              </div>
              <div>
                <div className="cs-n">
                  {presentDays}
                  <span className="cs-sub">/{loggedDays}</span>
                </div>
                <div className="cs-l">Present</div>
              </div>
              <div>
                <div className="cs-n">${Math.round(ledger.familyBalance).toLocaleString()}</div>
                <div className="cs-l">You owe</div>
              </div>
            </div>
            {mastery.summary.assessed > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="spread" style={{ alignItems: "baseline" }}>
                  <span className="small muted">Standards mastered</span>
                  <span className="small">
                    <strong>{mastery.summary.mastered}</strong> of {mastery.summary.assessed}
                  </span>
                </div>
                <StandardsBars summary={mastery.summary} />
              </div>
            )}
            <div className="row" style={{ gap: 10, marginTop: 12 }}>
              <Link className="btn ghost sm" href="/parent/feed">
                Feed
              </Link>
              <Link className="btn ghost sm" href="/parent/children">
                Details
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* tuition */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="spread">
          <div>
            <div className="eyebrow">Tuition</div>
            <h3 style={{ margin: "4px 0 0" }}>
              {familyBalance > 0
                ? `$${Math.round(familyBalance).toLocaleString()} due from your family`
                : "You’re all paid up"}
            </h3>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              ESA funding is billed to the state by the school — you only cover the family portion.
            </p>
          </div>
          <Link className="btn sec" href="/parent/tuition">
            Tuition & funding
          </Link>
        </div>
      </div>
    </>
  );
}
