import type { Metadata } from "next";
import Link from "next/link";
import { login } from "./actions";

export const metadata: Metadata = { title: "Sign in — Cohort" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; reset?: string }>;
}) {
  const { e: error, reset } = await searchParams;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 390 }}>
        <div className="row" style={{ gap: 10, marginBottom: 20 }}>
          <div className="brand-mark" style={{ background: "var(--mark)", color: "var(--blue)" }}>
            C
          </div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600 }}>Cohort</div>
        </div>
        <h1 style={{ marginBottom: 6 }}>Run the school. Get paid for it.</h1>
        <p className="muted" style={{ margin: "0 0 22px" }}>
          Attendance, coursework, grading, families, and ESA invoicing in one place.
        </p>
        {error && <div className="notice bad">{error}</div>}
        {reset && <div className="notice good">Password updated. Sign in with your new password.</div>}
        <form action={login} className="card">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
          <button className="btn" style={{ width: "100%", marginTop: 16 }}>
            Sign in
          </button>
        </form>
        <p className="small muted" style={{ margin: "12px 0 0", textAlign: "center" }}>
          New here? <Link href="/signup">Create your school</Link>.
        </p>
        <div className="card" style={{ marginTop: 12, background: "#FAFBF8" }}>
          <div className="eyebrow">Demo accounts</div>
          <div className="small mono" style={{ marginTop: 8, lineHeight: 1.9 }}>
            sarah@cedargrove.school &nbsp;/&nbsp; demo1234 &nbsp;<span className="muted">teacher</span>
            <br />
            dana@example.com &nbsp;/&nbsp; demo1234 &nbsp;<span className="muted">parent</span>
            <br />
            eli@cedargrove.school &nbsp;/&nbsp; demo1234 &nbsp;<span className="muted">student</span>
          </div>
        </div>
      </div>
    </div>
  );
}
