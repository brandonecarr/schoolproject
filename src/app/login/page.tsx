import type { Metadata } from "next";
import Link from "next/link";
import { login } from "./actions";

export const metadata: Metadata = { title: "Sign in — Cohort" };
export const dynamic = "force-dynamic";

const LOGIN_ERRORS: Record<string, string> = {
  bad: "That email and password don't match an account.",
  ambiguous:
    "That sign-in works at more than one school — open your school's own address and try there.",
  expired: "That sign-in link has expired. Sign in with your email and password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; reset?: string }>;
}) {
  const { e: error, reset } = await searchParams;
  // Codes, not sentences. This value comes off the query string, so rendering
  // it verbatim would let anyone hand out a link to a real sign-in page
  // carrying any message they liked — "your account is locked, call this
  // number" on our own domain. React escapes the markup; it cannot escape the
  // words. An unrecognised code shows nothing.
  const message = error ? LOGIN_ERRORS[error] : undefined;

  return (
    <div className="auth">
      {/* The split hero, back by request. The claim lives on the left over
          ruled-paper texture; the form sits on the plain canvas to its right,
          which is where a returning teacher's eye goes first. */}
      <aside className="auth-brand">
        <div className="lockup">
          <div className="brand-mark">C</div>
          <div className="wordmark">Cohort</div>
        </div>

        <div>
          <h1>Run the school. Get paid for it.</h1>
          <p>
            Attendance, coursework, grading, families, and state ESA invoicing — the system that
            gets a microschool paid, correctly and on time.
          </p>
        </div>

        <div>
          <div className="auth-marks" aria-hidden>
            <span className="lit" />
            <span className="lit" />
            <span className="lit" />
            <span className="lit" />
            <span />
            <span className="lit" />
          </div>
          <p style={{ fontSize: 13, marginTop: 12 }}>
            Teaching generates the proof. The proof gets you paid.
          </p>
        </div>
      </aside>

      <main className="auth-form-side">
        <div className="inner">
          <h1>Welcome back</h1>
          <p className="authsub">Sign in to your school.</p>

          {message && <div className="notice bad">{message}</div>}
          {reset && (
            <div className="notice good">Password updated. Sign in with your new password.</div>
          )}

          <form action={login} className="card2 authcard">
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
            <button
              className="btn"
              style={{ width: "100%", marginTop: 16, justifyContent: "center" }}
            >
              Sign in
            </button>
          </form>

          <p className="small muted" style={{ margin: "14px 0 0", textAlign: "center" }}>
            New here? <Link href="/signup">Create your school</Link>.
          </p>

          <div className="card2 authcard" style={{ marginTop: 16, background: "var(--surface2)" }}>
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
