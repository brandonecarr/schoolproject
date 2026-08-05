// A conversation view + compose box, shared by parent, student, and teacher.
// Server component — the compose form posts to the sendMessage server action.

import { sendMessage } from "@/lib/messaging-actions";

type Msg = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  createdAt: Date;
};

const timeOf = (d: Date) =>
  new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function MessageThread({
  messages,
  meId,
  studentId,
  redirectTo,
  placeholder = "Write a message…",
}: {
  messages: Msg[];
  meId: string;
  studentId: string;
  redirectTo: string;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="thread">
        {messages.length ? (
          messages.map((m) => (
            <div key={m.id} className={`msg ${m.senderId === meId ? "mine" : ""}`}>
              <div className="bubble">
                <div className="msg-meta">
                  {m.senderName} · {timeOf(m.createdAt)}
                </div>
                <div>{m.body}</div>
              </div>
            </div>
          ))
        ) : (
          <p className="muted small" style={{ padding: "8px 2px" }}>
            No messages yet.
          </p>
        )}
      </div>
      <form action={sendMessage} className="row" style={{ marginTop: 12, gap: 8 }}>
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <input name="body" placeholder={placeholder} required style={{ flex: 1, minWidth: 200 }} />
        <button className="btn">Send</button>
      </form>
    </div>
  );
}
