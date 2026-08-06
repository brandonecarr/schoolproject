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
    <div className="auth">
      <aside className="auth-brand">
        <div className="lockup">
          <div className="brand-mark">C</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600 }}>Cohort</div>
        </div>
        <div>
          <h1>Run the school. Get paid for it.</h1>
          <p>
            Attendance, coursework, grading, families, and state ESA invoicing — the system that gets a
            microschool paid, correctly and on time.
          </p>
        </div>
        <div>
          {/* the evidence-bar motif — the product's signature, as brand texture */}
          <div className="auth-marks">
            <span className="lit" />
            <span className="lit" />
            <span className="lit" />
            <span className="lit" />
            <span />
            <span className="lit" />
          </div>
          <p style={{ fontSize: 13, marginTop: 12 }}>Teaching generates the proof. The proof gets you paid.</p>
        </div>
      </aside>

      <main className="auth-form-side">
        <div className="inner">
          <h2 style={{ fontSize: 26, marginBottom: 4 }}>Welcome back</h2>
          <p className="muted" style={{ margin: "0 0 20px" }}>Sign in to your school.</p>

          {error && <div className="notice bad">{error}</div>}
          {reset && (
            <div className="notice good">Password updated. Sign in with your new password.</div>
          )}
          <form action={login} className="card">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="username" />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
            <button className="btn" style={{ width: "100%", marginTop: 16, justifyContent: "center" }}>
              Sign in
            </button>
          </form>
          <p className="small muted" style={{ margin: "12px 0 0", textAlign: "center" }}>
            New here? <Link href="/signup">Create your school</Link>.
          </p>
          <div className="card" style={{ marginTop: 16, background: "#fafbf8" }}>
            <div className="eyebrow">Demo accounts</div>
            <div className="small mono" style={{ marginTop: 8, lineHeight: 1.9 }}>
              sarah@cedargrove.school &nbsp;/&nbsp; demo1234 &nbsp;
              <span className="muted">teacher</span>
              <br />
              dana@example.com &nbsp;/&nbsp; demo1234 &nbsp;<span className="muted">parent</span>
              <br />
              eli@cedargrove.school &nbsp;/&nbsp; demo1234 &nbsp;
              <span className="muted">student</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
