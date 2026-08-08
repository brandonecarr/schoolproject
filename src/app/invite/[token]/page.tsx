import type { Metadata } from "next";
import { prisma, prismaSystem } from "@/lib/db";
import { tokenUsable } from "@/lib/tokens";
import { redirectTokenToTenant } from "@/lib/tenant-server";
import { acceptInvite } from "../actions";

export const metadata: Metadata = { title: "Accept invite — Cohort" };
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div className="row" style={{ gap: 10, marginBottom: 20 }}>
          <div className="brand-mark">C</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600 }}>Cohort</div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  // System: a tokenised link is followed before any session exists.
  const t = await prismaSystem.token.findUnique({ where: { token } });
  // Sent before this school had its own address, or opened from an
  // inbox that rewrote the link. The token knows where it belongs.
  if (t) await redirectTokenToTenant(t.schoolId, `/invite/${token}`);
  if (!t || t.type !== "parent_invite" || !tokenUsable(t)) {
    return (
      <Shell>
        <h1 style={{ marginBottom: 6 }}>This invite link isn&apos;t valid</h1>
        <p className="muted">
          It may have already been used or expired. Ask the school to send you a new one.
        </p>
      </Shell>
    );
  }

  const school = await prisma.school.findUnique({ where: { id: t.schoolId } });
  const child = t.studentId ? await prisma.student.findUnique({ where: { id: t.studentId } }) : null;

  return (
    <Shell>
      <h1 style={{ marginBottom: 6 }}>Join {school ? school.name : "your school"} on Cohort</h1>
      <p className="muted" style={{ margin: "0 0 20px" }}>
        {child ? `You've been invited as ${child.name}'s parent. ` : ""}
        Set a password to create your account.
      </p>
      {error && <div className="notice bad">That didn&apos;t work. The link may have expired.</div>}
      <form action={acceptInvite} className="card">
        <input type="hidden" name="token" value={token} />
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" defaultValue={t.name || ""} required />
        <label htmlFor="email">Email</label>
        <input id="email" value={t.email || ""} readOnly disabled />
        <label htmlFor="password">Choose a password</label>
        <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
        <button className="btn" style={{ width: "100%", marginTop: 16 }}>
          Create account
        </button>
      </form>
    </Shell>
  );
}
