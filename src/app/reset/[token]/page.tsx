import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { tokenUsable } from "@/lib/tokens";
import { redirectTokenToTenant } from "@/lib/tenant-server";
import { acceptReset } from "../actions";

export const metadata: Metadata = { title: "Reset password — Cohort" };
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

export default async function ResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const t = await prisma.token.findUnique({ where: { token } });
  // Sent before this school had its own address, or opened from an
  // inbox that rewrote the link. The token knows where it belongs.
  if (t) await redirectTokenToTenant(t.schoolId, `/reset/${token}`);
  if (!t || t.type !== "password_reset" || !t.userId || !tokenUsable(t)) {
    return (
      <Shell>
        <h1 style={{ marginBottom: 6 }}>This reset link isn&apos;t valid</h1>
        <p className="muted">It may have already been used or expired. Ask the school for a new one.</p>
      </Shell>
    );
  }

  const target = await prisma.user.findUnique({ where: { id: t.userId } });

  return (
    <Shell>
      <h1 style={{ marginBottom: 6 }}>Set a new password</h1>
      <p className="muted" style={{ margin: "0 0 20px" }}>
        {target ? `For ${target.email}.` : ""} Choose a new password to finish.
      </p>
      {error && <div className="notice bad">That didn&apos;t work. The link may have expired.</div>}
      <form action={acceptReset} className="card">
        <input type="hidden" name="token" value={token} />
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
        <button className="btn" style={{ width: "100%", marginTop: 16 }}>
          Set password
        </button>
      </form>
    </Shell>
  );
}
