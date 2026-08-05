import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { threadFor } from "@/lib/messages";
import { MessageThread } from "@/components/MessageThread";
import { AutoMarkRead } from "@/components/AutoMarkRead";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages — Cohort" };

export default async function ParentMessagesPage() {
  const { user } = await requireRole("parent");
  const ids: string[] = user.studentIdsJson ? JSON.parse(user.studentIdsJson) : [];
  const kids = (await prisma.student.findMany({ where: { id: { in: ids } } })).sort(
    (a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)
  );
  const threads = await Promise.all(kids.map(async (k) => ({ k, messages: await threadFor(k.id) })));

  return (
    <>
      {kids.map((k) => (
        <AutoMarkRead key={`mark_${k.id}`} studentId={k.id} />
      ))}
      <div className="topbar">
        <div>
          <div className="eyebrow">You &amp; the teacher</div>
          <h1>Messages</h1>
        </div>
      </div>

      {threads.map(({ k, messages }) => (
        <div key={k.id} className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            About {k.name}
          </div>
          <MessageThread
            messages={messages}
            meId={user.id}
            studentId={k.id}
            redirectTo="/parent/messages"
            placeholder={`Message ${k.name.split(" ")[0]}'s teacher…`}
          />
        </div>
      ))}
    </>
  );
}
