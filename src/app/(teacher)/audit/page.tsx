import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log — Cohort" };

// Human-readable timestamp with time (audit needs the clock, not just the date).
function ts(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return fmt(iso);
  }
}

export default async function AuditPage() {
  const { user } = await requireTeacher();

  // Scope: actors from this school (plus system actions with no actor). The
  // audit table isn't school-columned, so resolve actors to this school's users.
  const schoolUsers = await prisma.user.findMany({ where: { schoolId: user.schoolId } });
  const userIds = new Set(schoolUsers.map((u) => u.id));
  const nameOf = (id: string | null) =>
    id == null ? "system" : schoolUsers.find((u) => u.id === id)?.name || "—";

  const recent = await prisma.audit.findMany({ orderBy: { at: "desc" }, take: 300 });
  const rows = recent.filter((a) => a.actorId == null || userIds.has(a.actorId)).slice(0, 200);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Security program</div>
          <h1>Audit log</h1>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -12, maxWidth: "64ch" }}>
        Every consequential action is recorded — logins, consent events, grading, invoice
        transitions, data deletions, and retention purges. Reviewing this log periodically is part of
        the written security program COPPA expects.
      </p>

      <div className="card" style={{ padding: "16px 10px", marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((a) => (
                <tr key={a.id}>
                  <td className="small mono" style={{ whiteSpace: "nowrap" }}>
                    {ts(a.at)}
                  </td>
                  <td className="small">{nameOf(a.actorId)}</td>
                  <td className="small mono">{a.action}</td>
                  <td className="small muted">{a.detail}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: "22px 10px" }}>
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
