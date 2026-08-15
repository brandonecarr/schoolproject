import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { signup } from "./actions";
import { SlugField } from "./SlugField";
import { StateNote } from "./StateNote";
import { rootDomain } from "@/lib/tenant-config";
import { PROGRAMS } from "@/lib/rules";
import { stripeConfigured, familyTierOpen } from "@/lib/stripe";
import { KIND_COPY, PRICE_USD, parseKind } from "@/lib/kind";

export const metadata: Metadata = { title: "Create your account — Cohort" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "1": "Please fill in every field.",
  slug: "That address isn't available. Try another.",
  slugbad:
    "An address can use lowercase letters, numbers and hyphens, and needs at least three characters.",
  billing:
    "Signups are momentarily paused while we finish setting up billing. Nothing was created — email info@schoolcohort.com and we'll let you know the moment it reopens.",
  familybilling:
    "The homeschool family plan isn't open for signup just yet. Nothing was created — email info@schoolcohort.com and we'll let you know when it is.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; canceled?: string; kind?: string }>;
}) {
  const { error, canceled, kind: rawKind } = await searchParams;
  const kind = parseKind(rawKind);
  const family = kind === "family";
  const copy = KIND_COPY[kind];
  const message = error ? ERRORS[error] : undefined;
  const paywalled = stripeConfigured();
  // The family door: open when there's no paywall at all (dev, previews) or
  // when its price exists. Closed → the form says so and won't submit.
  const familyClosed = family && !familyTierOpen();
  const root = rootDomain();
  // Code -> programme label, e.g. AZ -> "Arizona ESA". Only what the note
  // needs; the client component gets no more of the rules table than that.
  const programs = Object.fromEntries(Object.entries(PROGRAMS).map(([c, p]) => [c, p.label]));
  const homeNotes = Object.fromEntries(
    Object.entries(PROGRAMS).flatMap(([c, p]) => (p.homeEducation ? [[c, p.homeEducation]] : []))
  );

  return (
    <div className="authplain">
      <main className="authcol">
        <div className="lockup lockup-hero">
          <Image src="/logo-mark.png" alt="" width={58} height={75} className="brand-markimg" />
          <div>
            <div className="wordmark">Cohort</div>
            <div className="tagline">
              Run the school.
              <br />
              Get paid for it.
            </div>
          </div>
        </div>

        <h1>{copy.startCta}</h1>

        {/* Which plan. Two links, not a client toggle: the page is a server
            component and the URL is the state — a refresh, a back button, or a
            shared link all land on the same chooser. */}
        <nav className="su-kind" aria-label="Account type">
          <Link href="/signup?kind=school" className={family ? "" : "on"} aria-current={family ? undefined : "page"}>
            <strong>A microschool or co-op</strong>
            <span>You enrol families and invoice their ESA program.</span>
          </Link>
          <Link href="/signup?kind=family" className={family ? "on" : ""} aria-current={family ? "page" : undefined}>
            <strong>A homeschooling family</strong>
            <span>You teach your own kids and file ESA expense claims.</span>
          </Link>
        </nav>

        {message && <div className="notice bad">{message}</div>}
        {canceled && (
          <div className="notice warn">
            Checkout was canceled — nothing was charged and no account was created. Your details
            below start fresh.
          </div>
        )}
        {familyClosed && (
          <div className="notice warn">
            The homeschool family plan isn&apos;t open for signup just yet. Email
            info@schoolcohort.com and we&apos;ll let you know the moment it is.
          </div>
        )}
        {paywalled && !familyClosed && (
          <p className="small muted" style={{ marginBottom: 12 }}>
            Next step is secure checkout — <strong>${PRICE_USD[kind]}/month</strong>, flat,{" "}
            {family ? "all your children" : "any number of students"}, cancel anytime. Your{" "}
            {copy.org} is created the moment payment completes.
          </p>
        )}

        <form action={signup} className="card2 authcard">
          <input type="hidden" name="kind" value={kind} />

          {/* The field is named schoolName for BOTH kinds: SlugField listens
              for that name to derive the address, and the action reads it. */}
          <label htmlFor="schoolName">{copy.nameLabel}</label>
          <input id="schoolName" name="schoolName" required placeholder={copy.namePlaceholder} />

          {/* The address is chosen here and not changed later: it goes into
              every link the account sends, their bookmarks, and the calendar
              feeds already subscribed. Prefilled from the name so most people
              never touch it, editable because long names make long addresses. */}
          <SlugField
            root={root}
            label={copy.slugLabel}
            help={copy.slugHelp}
            placeholder={family ? "the-alvarez-family" : "cedar-grove"}
          />

          <div className="row" style={{ gap: 12 }}>
            <div style={{ width: 110 }}>
              <label htmlFor="state">State</label>
              <input id="state" name="state" required maxLength={2} placeholder="AZ" />
            </div>
            {!family && (
              <div style={{ flex: 1, minWidth: 160 }}>
                <label htmlFor="esaAmount">ESA amount / student</label>
                <input id="esaAmount" name="esaAmount" type="number" min={0} defaultValue={7400} />
              </div>
            )}
          </div>
          {/* Was a paragraph listing all 23 configured state codes. A founder
              cannot change their state, so the coverage list answered a
              question nobody was asking while pushing the form off the screen.
              StateNote answers the real one — "what about mine?" — in one line,
              and only once there is a state to answer about. Still derived
              from PROGRAMS, so it cannot go stale. */}
          <StateNote programs={programs} family={family} homeNotes={homeNotes} />

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

          <button
            className="btn"
            style={{ width: "100%", marginTop: 18, justifyContent: "center" }}
            disabled={familyClosed}
          >
            {copy.createCta}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 14, textAlign: "center" }}>
          Already have an account? Sign in at its own address. <Link href="/">Home</Link>
        </p>
      </main>
    </div>
  );
}
