import type { Metadata } from "next";
import Link from "next/link";
import { signup } from "./actions";
import { SlugField } from "./SlugField";
import { StateNote } from "./StateNote";
import { rootDomain } from "@/lib/tenant-config";
import { PROGRAMS } from "@/lib/rules";

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
  // Code -> programme label, e.g. AZ -> "Arizona ESA". Only what the note
  // needs; the client component gets no more of the rules table than that.
  const programs = Object.fromEntries(Object.entries(PROGRAMS).map(([c, p]) => [c, p.label]));

  return (
    <div className="authplain">
      <main className="authcol">
        <div className="lockup">
          <div className="brand-mark">C</div>
          <div>
            <div className="wordmark">Cohort</div>
            <div className="tagline">Run the school. Get paid for it.</div>
          </div>
        </div>

        <h1>Start your school</h1>

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
          {/* Was a paragraph listing all 23 configured state codes. A founder
              cannot change their state, so the coverage list answered a
              question nobody was asking while pushing the form off the screen.
              StateNote answers the real one — "what about mine?" — in one line,
              and only once there is a state to answer about. Still derived
              from PROGRAMS, so it cannot go stale. */}
          <StateNote programs={programs} />

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
          Already have a school? Sign in at its own address. <Link href="/">Home</Link>
        </p>
      </main>
    </div>
  );
}
