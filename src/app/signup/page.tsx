import type { Metadata } from "next";
import Link from "next/link";
import { signup } from "./actions";

export const metadata: Metadata = { title: "Create your school — Cohort" };
export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div className="row" style={{ gap: 10, marginBottom: 20 }}>
          <div className="brand-mark" style={{ background: "var(--mark)", color: "var(--blue)" }}>
            C
          </div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600 }}>Cohort</div>
        </div>
        <h1 style={{ marginBottom: 6 }}>Start your school on Cohort</h1>
        <p className="muted" style={{ margin: "0 0 22px" }}>
          Create your school and owner account. You can add students, families, and staff next.
        </p>
        {error === "slug" ? (
          <div className="notice bad">
            We couldn&apos;t make a web address out of that school name. Try a name with a few
            letters or numbers in it.
          </div>
        ) : error ? (
          <div className="notice bad">Please fill in every field.</div>
        ) : null}

        <form action={signup} className="card">
          <label htmlFor="schoolName">School name</label>
          <input id="schoolName" name="schoolName" required placeholder="Cedar Grove Learning Collective" />
          <div className="row" style={{ gap: 12 }}>
            <div style={{ width: 110 }}>
              <label htmlFor="state">State</label>
              <input id="state" name="state" required maxLength={2} placeholder="AZ" />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="esaAmount">ESA amount / student</label>
              <input id="esaAmount" name="esaAmount" type="number" min={0} defaultValue={7400} />
            </div>
          </div>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            ESA rails are configured for AZ, FL, IA, UT, and AR. Other states work without an ESA rail.
          </p>

          <div className="sep" style={{ margin: "16px 0" }} />
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" required />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />

          <button className="btn" style={{ width: "100%", marginTop: 16 }}>
            Create school
          </button>
        </form>
        <p className="small muted" style={{ marginTop: 12, textAlign: "center" }}>
          Already have an account? <Link href="/login">Sign in</Link>.
        </p>
      </div>
    </div>
  );
}
