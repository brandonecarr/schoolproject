import { requireRole } from "@/lib/auth";
import { threadFor } from "@/lib/messages";
import { MessageThread } from "@/components/MessageThread";
import { AutoMarkRead } from "@/components/AutoMarkRead";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages — Cohort" };

export default async function StudentMessagesPage() {
  const { user } = await requireRole("student");
  const sid = user.studentId ?? "";
  const messages = await threadFor(sid);

  return (
    <>
      {sid && <AutoMarkRead studentId={sid} />}
      <div className="topbar">
        <div>
          <div className="eyebrow">You &amp; your teacher</div>
          <h1>Messages</h1>
        </div>
      </div>
      <div className="card">
        <MessageThread
          messages={messages}
          meId={user.id}
          studentId={sid}
          redirectTo="/student/messages"
          placeholder="Ask your teacher a question…"
        />
      </div>
    </>
  );
}
