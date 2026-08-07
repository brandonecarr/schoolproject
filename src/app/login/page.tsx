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
      {/* The handoff replaces the old two-column split (dark brand panel beside
          the form) with a centred lockup on the tinted canvas. The claim that
          used to fill the left panel moves under the wordmark, where it still
          says what this is to someone arriving cold, without needing half the
          screen to do it. */}
      <main className="authcol">
        <div className="lockup">
          <div className="brand-mark">C</div>
          <div>
            <div className="wordmark">Cohort</div>
            <div className="tagline">Run the school. Get paid for it.</div>
          </div>
        </div>

        <h1>Welcome back</h1>
        <p className="authsub">Sign in to your school.</p>

        {error && <div className="notice bad">{error}</div>}
        {reset && <div className="notice good">Password updated. Sign in with your new password.</div>}

        <form action={login} className="card2 authcard">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
          <button className="btn" style={{ width: "100%", marginTop: 16, justifyContent: "center" }}>
            Sign in
          </button>
        </form>

        <p className="small muted" style={{ margin: "14px 0 0", textAlign: "center" }}>
          New here? <Link href="/signup">Create your school</Link>.
        </p>

        <div className="card2 authcard" style={{ marginTop: 16, background: "var(--surface2)" }}>
          <div className="eyebrow">Demo accounts</div>
          <div className="small mono" style={{ marginTop: 8, lineHeight: 1.9 }}>
            sarah@cedargrove.school &nbsp;/&nbsp; demo1234 &nbsp;<span className="muted">teacher</span>
            <br />
            dana@example.com &nbsp;/&nbsp; demo1234 &nbsp;<span className="muted">parent</span>
            <br />
            eli@cedargrove.school &nbsp;/&nbsp; demo1234 &nbsp;<span className="muted">student</span>
          </div>
        </div>
      </main>
    </div>
  );
}
