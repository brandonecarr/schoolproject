import type { Metadata } from "next";
import Link from "next/link";
import { signup } from "./actions";
import { SlugField } from "./SlugField";
import { rootDomain } from "@/lib/tenant-config";

export const metadata: Metadata = { title: "Create your school — Cohort" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "1": "Please fill in every field.",
  slug: "That address isn't available. Try another.",
  slugbad:
    "An address can use lowercase letters, numbers and hyphens, and needs at least three characters.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERRORS[error] : undefined;
  const root = rootDomain();

  return (
    <div className="auth">
      <main className="authcol">
        <div className="lockup">
          <div className="brand-mark">C</div>
          <div>
            <div className="wordmark">Cohort</div>
            <div className="tagline">Run the school. Get paid for it.</div>
          </div>
        </div>

        <h1>Start your school</h1>
        <p className="authsub">
          Your school and your owner account. Students, families and staff come next.
        </p>

        {message && <div className="notice bad">{message}</div>}

        <form action={signup} className="card2 authcard">
          <label htmlFor="schoolName">School name</label>
          <input
            id="schoolName"
            name="schoolName"
            required
            placeholder="Cedar Grove Learning Collective"
          />

          {/* The address is chosen here and not changed later: it goes into
              every link the school sends a family, their bookmarks, and the
              calendar feeds parents have already subscribed to. Prefilled from
              the name so most people never touch it, editable because "Cedar
              Grove Learning Collective" makes a long address. */}
          <SlugField root={root} />

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
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            ESA rails are configured for AZ, FL, IA, UT and AR. Other states work without one.
          </p>

          <div className="sep" style={{ margin: "18px 0" }} />
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" required />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
          />

          <button className="btn" style={{ width: "100%", marginTop: 18, justifyContent: "center" }}>
            Create school
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 14, textAlign: "center" }}>
          Already have a school? Sign in at your school&apos;s own address.{" "}
          <Link href="/">Back to the home page</Link>.
        </p>
      </main>
    </div>
  );
}
