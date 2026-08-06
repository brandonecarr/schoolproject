import { headers } from "next/headers";
import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Pill, Notice } from "@/components/ui";
import { tokenUsable } from "@/lib/tokens";
import { createParentInvite, generateResetLink } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invite families — Cohort" };

export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; reset?: string; exists?: string }>;
}) {
  const { school } = await requireTeacher();
  const schoolId = school!.id;
  const sp = await searchParams;

  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

  const students = await prisma.student.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  const parents = await prisma.user.findMany({ where: { schoolId, role: "parent" } });
  const kidAccounts = await prisma.user.findMany({ where: { schoolId, role: "student" } });
  const nameOf = (id?: string | null) => students.find((s) => s.id === id)?.name || "—";

  const childOf = (p: (typeof parents)[number]) => {
    const ids: string[] = p.studentIdsJson ? JSON.parse(p.studentIdsJson) : [];
    return students.find((s) => s.id === ids[0]);
  };

  const pendingInvites = (
    await prisma.token.findMany({
      where: { schoolId, type: "parent_invite", usedAt: null },
      orderBy: { createdAt: "desc" },
    })
  ).filter(tokenUsable);

  return (
    <>
      {sp.invite && (
        <Notice tone="good">
          Invite link created — copy it and send it to the parent. It expires in 14 days.
          <input
            readOnly
            value={`${base}/invite/${sp.invite}`}
            style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 12.5 }}
          />
        </Notice>
      )}
      {sp.reset && (
        <Notice tone="good">
          Password-reset link created — share it with the account holder. It expires in 2 days.
          <input
            readOnly
            value={`${base}/reset/${sp.reset}`}
            style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 12.5 }}
          />
        </Notice>
      )}
      {sp.exists && <Notice tone="warn">An account with that email already exists.</Notice>}

      <div className="topbar">
        <div>
          <div className="eyebrow">Accounts</div>
          <h1>Invite families</h1>
        </div>
      </div>

      <div className="notice info">
        <strong>How student accounts work here.</strong> You invite the parent with a one-time link.
        The parent sets their own password, then creates the child&apos;s login from their own account.
        That order is what makes parental consent verifiable — the legal requirement when a child under
        13 logs in and submits work.
      </div>

      <form action={createParentInvite} className="card">
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="pn">Parent name</label>
            <input id="pn" name="name" required />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="pe">Parent email</label>
            <input id="pe" name="email" type="email" required />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="ps">Child</label>
            <select id="ps" name="studentId" required disabled={students.length === 0}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn" style={{ marginTop: 12 }} disabled={students.length === 0}>
          Create invite link
        </button>
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          Generates a one-time link (no shared password). Share it however you like — email, text, or
          in person. Don’t see the child? <Link href="/students">Enroll them on the roster first</Link>.
        </p>
      </form>

      {pendingInvites.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow">Pending invites</div>
          {pendingInvites.map((t) => (
            <div key={t.id} style={{ padding: "10px 0", borderTop: "1px solid var(--rule)" }}>
              <div className="small">
                <strong>{t.email}</strong> · {nameOf(t.studentId)}
              </div>
              <input
                readOnly
                value={`${base}/invite/${t.token}`}
                style={{ marginTop: 6, fontFamily: "var(--mono)", fontSize: 12 }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="sep" />
      <div className="card" style={{ padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Email</th>
              <th>Role</th>
              <th>Child has login</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {parents.map((p) => {
              const kid = childOf(p);
              const has = kidAccounts.some((k) => k.studentId === kid?.id);
              return (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="small muted">{kid ? kid.name : "—"}</div>
                  </td>
                  <td className="small mono">{p.email}</td>
                  <td className="small">Parent</td>
                  <td>{has ? <Pill tone="good">Yes</Pill> : <Pill tone="warn">Not yet</Pill>}</td>
                  <td style={{ textAlign: "right" }}>
                    <form action={generateResetLink}>
                      <input type="hidden" name="userId" value={p.id} />
                      <button className="btn ghost sm">Reset link</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {kidAccounts.map((k) => (
              <tr key={k.id}>
                <td>
                  <strong>{k.name}</strong>
                  <div className="small muted">student login</div>
                </td>
                <td className="small mono">{k.email}</td>
                <td className="small">Student</td>
                <td>—</td>
                <td style={{ textAlign: "right" }}>
                  <form action={generateResetLink}>
                    <input type="hidden" name="userId" value={k.id} />
                    <button className="btn ghost sm">Reset link</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
