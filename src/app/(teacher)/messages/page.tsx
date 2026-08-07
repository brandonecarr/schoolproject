import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Pill, Avatar } from "@/components/ui";

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
      <div className="card2 nopad threadlist" style={{ maxWidth: 620 }}>
        {rows.map(({ s, latest, unread }) => (
          <Link key={s.id} href={`/messages/${s.id}`} className="threadrow">
            <Avatar name={s.name} size={34} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="who">
                <span className="nm">{s.name}</span>
                <span className="row" style={{ gap: 8 }}>
                  {unread > 0 && <Pill tone="info">{unread} new</Pill>}
                  {latest && <span className="tm">{timeOf(latest.createdAt)}</span>}
                </span>
              </span>
              <span className="prev">
                {latest
                  ? `${latest.senderName}: ${latest.body}`
                  : "No messages yet — start the conversation"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
