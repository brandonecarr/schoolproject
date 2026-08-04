import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Pill, Notice } from "@/components/ui";
import { createParentInvite } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invite families — Cohort" };

export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>;
}) {
  const { school } = await requireTeacher();
  const schoolId = school!.id;
  const sp = await searchParams;

  const students = await prisma.student.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  const parents = await prisma.user.findMany({ where: { schoolId, role: "parent" } });
  const kidAccounts = await prisma.user.findMany({ where: { schoolId, role: "student" } });

  const childOf = (p: (typeof parents)[number]) => {
    const ids: string[] = p.studentIdsJson ? JSON.parse(p.studentIdsJson) : [];
    return students.find((s) => s.id === ids[0]);
  };

  return (
    <>
      {sp.invited && (
        <Notice tone="good">
          Parent account created. They can invite their own child from their portal.
        </Notice>
      )}
      <div className="topbar">
        <div>
          <div className="eyebrow">Accounts</div>
          <h1>Invite families</h1>
        </div>
      </div>

      <div className="notice info">
        <strong>How student accounts work here.</strong> You invite the parent. The parent creates the
        child&apos;s login from their own account. That order matters — it&apos;s what makes parental
        consent verifiable, which is the legal requirement when a child under 13 logs in and submits
        work.
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
            <select id="ps" name="studentId">
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn" style={{ marginTop: 12 }}>
          Create parent account
        </button>
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          Demo shortcut: the account is created immediately with the password{" "}
          <span className="mono">demo1234</span>. Production sends a one-time invite link instead.
        </p>
      </form>

      <div className="sep" />
      <div className="card" style={{ padding: "16px 10px" }}>
        <table>
          <thead>
            <tr>
              <th>Parent</th>
              <th>Email</th>
              <th>Child</th>
              <th>Child has login</th>
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
                  </td>
                  <td className="small mono">{p.email}</td>
                  <td className="small">{kid ? kid.name : "—"}</td>
                  <td>{has ? <Pill tone="good">Yes</Pill> : <Pill tone="warn">Not yet</Pill>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
