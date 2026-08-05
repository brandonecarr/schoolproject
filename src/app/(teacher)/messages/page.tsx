import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Pill } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages — Cohort" };

const timeOf = (d: Date) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function MessagesInboxPage() {
  const { school } = await requireTeacher();
  const schoolId = school!.id;

  const students = await prisma.student.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  const messages = await prisma.message.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" } });

  const rows = students
    .map((s) => {
      const mine = messages.filter((m) => m.studentId === s.id);
      const latest = mine[0];
      const unread = mine.filter((m) => (m.senderRole === "parent" || m.senderRole === "student") && !m.readByStaff).length;
      return { s, latest, unread, count: mine.length };
    })
    .sort((a, b) => {
      // unread first, then most recent activity, then name order
      if (a.unread !== b.unread) return b.unread - a.unread;
      const at = a.latest ? a.latest.createdAt.getTime() : 0;
      const bt = b.latest ? b.latest.createdAt.getTime() : 0;
      return bt - at;
    });

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Families</div>
          <h1>Messages</h1>
        </div>
      </div>
      <div className="card" style={{ padding: "6px 18px" }}>
        {rows.map(({ s, latest, unread }) => (
          <Link
            key={s.id}
            href={`/messages/${s.id}`}
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ padding: "14px 0", borderTop: "1px solid var(--rule)" }}>
              <div className="spread">
                <strong>{s.name}</strong>
                <span className="row" style={{ gap: 8 }}>
                  {unread > 0 && <Pill tone="mark">{unread} new</Pill>}
                  {latest && <span className="small muted">{timeOf(latest.createdAt)}</span>}
                </span>
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>
                {latest ? `${latest.senderName}: ${latest.body.slice(0, 80)}` : "No messages yet — start the conversation"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
