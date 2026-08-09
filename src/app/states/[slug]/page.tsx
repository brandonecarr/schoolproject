// /states/arizona — one program, everything Cohort's rules table knows about
// it, and nothing it doesn't.
//
// These pages exist to be found. The person searching "microschool ESA
// software arizona" is a founder trying to work out whether the paperwork is
// survivable, and the honest answer is more useful — and more credible — than
// a brochure: here is the program, here is who administers it, here is what
// they ask for on an invoice, here is what we have and haven't verified.
//
// Every claim is derived from src/lib/rules.ts via states.ts. The copy below
// is a frame around that data; it asserts nothing state-specific itself.

import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentHostKind } from "@/lib/tenant-server";
import { statePageBySlug, statePages } from "@/lib/states";
import { TrackView } from "@/components/TrackView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = statePageBySlug(slug);
  if (!s) return { title: "State programs — Cohort" };
  return {
    title: `Microschool software for the ${s.label} — Cohort`,
    description: `Run a microschool on ${s.name}'s ${s.program}: attendance evidence, ${
      s.railLabel ? `invoice packets built for ${s.railLabel}` : "reimbursement-ready invoice packets"
    }, and program deadline tracking. Approximate award ~$${s.amount.toLocaleString()}/student/year.`,
  };
}

export default async function StatePage({ params }: { params: Promise<{ slug: string }> }) {
  const kind = await currentHostKind();
  if (kind.kind !== "apex") redirect("/");

  const { slug } = await params;
  const s = statePageBySlug(slug);
  if (!s) notFound();

  const others = statePages().filter((o) => o.code !== s.code);

  return (
    <div className="lp">
      <TrackView path={`/states/${s.slug}`} />
      <div className="lp-card">
        <header className="lp-head">
          <Link className="lp-lockup" href="/">
            <Image src="/logo-mark.png" alt="" width={28} height={37} className="lp-markimg" priority />
            <span className="lp-word">Cohort</span>
          </Link>
          <div className="lp-headright">
            <Link className="lp-textlink" href="/states">
              All states
            </Link>
            <Link className="lp-pill" href="/signup">
              Start your school
              <span className="lp-well" aria-hidden>
                →
              </span>
            </Link>
          </div>
        </header>

        <section className="lp-wrap lp-section">
          <div className="lp-eyebrow">
            {s.name} · {s.kindLabel}
          </div>
          <h1 className="lp-h2">Running a microschool on the {s.label}</h1>
          <p className="lp-body" style={{ maxWidth: "68ch" }}>
            {s.name} funds eligible students through the {s.program}
            {s.railLabel ? (
              <>
                , administered through <strong>{s.railLabel}</strong>
              </>
            ) : null}
            . Approximate award: <strong>~${s.amount.toLocaleString()}</strong> per student per
            year — set annually, sometimes prorated or tiered, so the figure that counts is the
            one on the family&apos;s award letter, not this page.
          </p>

          {!s.live && (
            <p className="lp-callout">
              Enacted but not yet disbursing — you can set up and plan, but there is nothing to
              invoice yet.
            </p>
          )}
          {s.limited && (
            <p className="lp-callout">Eligibility is narrower than every student: {s.limited}.</p>
          )}

          {s.unverified && (
            <p className="lp-callout">
              ⚑ Cohort&apos;s rules for this program are inferred from public program documents and
              have not yet been confirmed against a real invoice cycle. They are a starting point,
              not advice — the same flag appears inside the product until a cycle is observed.
            </p>
          )}
        </section>

        {s.requires.length > 0 && (
          <section className="lp-wrap lp-section">
            <div className="lp-eyebrow">The paperwork</div>
            <h2>What {s.railLabel ?? "the administrator"} asks for</h2>
            <p className="lp-body" style={{ maxWidth: "68ch" }}>
              Every reimbursement packet Cohort builds for a school in {s.name} is assembled
              against this list, so the invoice that goes out already carries what the reviewer
              looks for:
            </p>
            <ul className="lp-joblist">
              {s.requires.map((r) => (
                <li key={r}>
                  <span className="lp-bullet" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          </section>
        )}

        {s.obligations.length > 0 && (
          <section className="lp-wrap lp-section">
            <div className="lp-eyebrow">Deadlines</div>
            <h2>Reporting the {s.label} is documented to expect</h2>
            <p className="lp-body" style={{ maxWidth: "68ch" }}>
              Cohort tracks these as deadlines on your school calendar and nudges you as they
              approach. The dates below are deliberately absent: you enter yours from the award
              letter or program portal, because a confidently wrong deadline is worse than none.
            </p>
            <ul className="lp-joblist">
              {s.obligations.map((o) => (
                <li key={o.key}>
                  <span className="lp-bullet" aria-hidden />
                  <span>
                    <strong>{o.label}.</strong> {o.hint}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {s.alsoRuns.length > 0 && (
          <section className="lp-wrap lp-section">
            <div className="lp-eyebrow">Also in {s.name}</div>
            <h2>Other programs the state runs</h2>
            <ul className="lp-joblist">
              {s.alsoRuns.map((a) => (
                <li key={a}>
                  <span className="lp-bullet" aria-hidden />
                  {a}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="lp-wrap lp-section">
          <div className="lp-eyebrow">What Cohort does with all of this</div>
          <h2>The system that gets {s.name} microschools paid</h2>
          <div className="lp-limitgrid">
            <p>
              <strong>Attendance becomes evidence.</strong> Published term dates plus a daily log
              turn &quot;we logged 12 days&quot; into &quot;present for 12 of the 14 instructional
              days in this period&quot; — a claim a reviewer can check.
            </p>
            <p>
              <strong>Invoices come out packet-shaped.</strong> Work samples, graded feedback,
              receipts and your provider ID assembled into the document the administrator
              actually reviews.
            </p>
            <p>
              <strong>Deadlines live on the calendar.</strong> Expense reports and renewals sit
              beside your term dates, on the dashboard as they approach.
            </p>
            <p>
              <strong>And the limits are the same everywhere.</strong> Cohort never holds your
              money, never submits on its own, and flags every rule it hasn&apos;t verified —
              including {s.name}&apos;s.
            </p>
          </div>
          <div className="lp-ctarow" style={{ marginTop: 22 }}>
            <Link className="lp-pill lp-pill-lg" href="/signup">
              Start your school
              <span className="lp-well" aria-hidden>
                →
              </span>
            </Link>
            <Link className="lp-textlink" href="/">
              See how Cohort works
            </Link>
          </div>
        </section>

        <section className="lp-wrap lp-section">
          <div className="lp-eyebrow">Other states</div>
          <div className="lp-stripstates" style={{ flexWrap: "wrap" }}>
            {others.map((o) => (
              <Link key={o.code} href={`/states/${o.slug}`} className="lp-textlink">
                {o.name}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
