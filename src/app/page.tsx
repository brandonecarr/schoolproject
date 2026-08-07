import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { currentHostKind } from "@/lib/tenant-server";
import { rootDomain } from "@/lib/tenant-config";

// "/" means two different things depending on the address it arrives on.
//
// On a school's own subdomain, and on any untenanted deployment, it is what it
// has always been: send each role to their home. On the apex it is the public
// front of the product, because there is no school there to send anyone to.
//
// WHAT THIS PAGE MAY CLAIM. Everything here is load-bearing for a school
// deciding whether to run their reimbursements through us, so the limits are
// on the page rather than in the small print: we never hold anyone's money, we
// never submit on their behalf, the model drafts and a person approves, and a
// rule we have not yet watched survive a real invoice cycle says so. A landing
// page that oversells this product gets a microschool's funding rejected.

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cohort — the system that gets a microschool paid",
  description:
    "Attendance, evidence, and ESA reimbursement paperwork for microschools and homeschool co-ops. Correctly, on time, in any state.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string }>;
}) {
  const kind = await currentHostKind();

  if (kind.kind !== "apex") {
    const session = await getSession();
    if (!session) redirect("/login");
    if (session.user.role === "parent") redirect("/parent/feed");
    if (session.user.role === "student") redirect("/student");
    redirect("/dashboard");
  }

  const { signin } = await searchParams;
  const root = rootDomain();

  return (
    <div className="lp">
      <header className="lp-bar">
        <div className="lp-wrap lp-barin">
          <div className="lockup">
            <div className="brand-mark">C</div>
            <div className="wordmark">Cohort</div>
          </div>
          <nav className="lp-barnav" aria-label="Site">
            <a href="#how">How it works</a>
            <a href="#limits">What it won&apos;t do</a>
            <Link className="btn sec sm" href="/signup">
              Start your school
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Someone typed the bare domain looking for their school. They cannot
            sign in here — the session cookie is host-only, so an account only
            exists at its own address — and the honest answer is to tell them
            where to look rather than show a form that would not work. */}
        {signin && (
          <section className="lp-wrap">
            <div className="card lp-find" role="status">
              <div className="eyebrow">Looking for your school?</div>
              <p>
                Each school signs in at its own address, not this one — something like{" "}
                <span className="mono">cedar-grove.{root}</span>. It&apos;s in the invitation your
                school sent you, and in any email Cohort has sent you since.
              </p>
              <p className="small muted">
                Can&apos;t find it? Ask whoever runs your school — they can resend the invitation
                from their end. We can&apos;t look up a family&apos;s school from here, on purpose.
              </p>
            </div>
          </section>
        )}

        <section className="lp-wrap lp-hero">
          <h1>The system that gets a microschool paid.</h1>
          <p className="lp-lede">
            Take attendance. Cohort turns it into the reimbursement packet your state actually
            accepts — with the evidence attached, in the format the reviewer expects, before the
            deadline.
          </p>
          <div className="lp-cta">
            <Link className="btn" href="/signup">
              Start your school
            </Link>
            <span className="small muted">
              Free to set up. Your school gets its own address at{" "}
              <span className="mono">yourschool.{root}</span>.
            </span>
          </div>
        </section>

        <section className="lp-wrap lp-why">
          <div className="lp-cardrow">
            <div className="card2 lp-point">
              <div className="eyebrow">The actual job</div>
              <h2>Reimbursement is the business</h2>
              <p>
                A microschool with six students and an ESA program behind them is running a claims
                operation. Miss a cycle and payroll is late. Everything else in the school depends
                on this one thing working.
              </p>
            </div>
            <div className="card2 lp-point">
              <div className="eyebrow">Why it&apos;s hard</div>
              <h2>Every state words it differently</h2>
              <p>
                Arizona, Florida, Iowa, Utah and Arkansas each want a different attendance
                denominator, a different receipt, a different attestation. The rules change between
                cycles, and nobody sends you a diff.
              </p>
            </div>
            <div className="card2 lp-point">
              <div className="eyebrow">Where it breaks</div>
              <h2>Evidence, not enthusiasm</h2>
              <p>
                Rejections are almost never about the teaching. They&apos;re about a missing day, an
                unsigned line, a work sample nobody kept. Cohort keeps the evidence as you go, so
                the packet is already built when the window opens.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-wrap lp-how" id="how">
          <div className="eyebrow">How it works</div>
          <h2>Three things, in this order</h2>
          <ol className="lp-steps">
            <li>
              <div className="lp-stepn" aria-hidden>
                1
              </div>
              <div>
                <h3>Run your school</h3>
                <p>
                  Attendance, assignments, grading, portfolios, conferences, messages home. Ordinary
                  daily work — the kind you&apos;d be doing in a spreadsheet anyway.
                </p>
              </div>
            </li>
            <li>
              <div className="lp-stepn" aria-hidden>
                2
              </div>
              <div>
                <h3>Cohort assembles the packet</h3>
                <p>
                  Attendance counted against your school&apos;s own instructional calendar, work
                  samples attached, narrative drafted, all on your letterhead. It knows your
                  state&apos;s rules — and it tells you which of those rules it has not yet watched
                  survive a real invoice cycle.
                </p>
              </div>
            </li>
            <li>
              <div className="lp-stepn" aria-hidden>
                3
              </div>
              <div>
                <h3>You read it and submit it</h3>
                <p>
                  Nothing goes anywhere until a person approves it. When a packet comes back
                  rejected, Cohort records the reviewer&apos;s exact wording — that&apos;s how it
                  gets better at your state instead of guessing.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="lp-wrap" id="limits">
          <div className="card lp-limits">
            <div className="eyebrow">What Cohort will not do</div>
            <h2>The limits, up front</h2>
            <ul>
              <li>
                <strong>It never holds your money.</strong> Reimbursements go from the state or the
                ESA vendor to you. Cohort is never in that path and never has a balance of yours.
              </li>
              <li>
                <strong>It never submits for you.</strong> AI drafts; a person approves; nothing is
                auto-filed. A system that could submit on its own could submit something wrong on
                its own.
              </li>
              <li>
                <strong>It flags what it hasn&apos;t verified.</strong> A rule Cohort inferred but
                has not yet seen hold up against a real invoice carries a visible mark. You should
                treat those as a starting point, not as advice.
              </li>
              <li>
                <strong>Children&apos;s accounts come from parents.</strong> A school cannot create
                a student login. A parent does, with consent recorded — and child records are
                deleted on a schedule you set.
              </li>
            </ul>
          </div>
        </section>

        <section className="lp-wrap lp-end">
          <h2>Start your school on Cohort</h2>
          <p className="lp-lede">
            You&apos;ll pick a name and a state, and get your own address in about a minute.
          </p>
          <Link className="btn" href="/signup">
            Start your school
          </Link>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span>Cohort — microschool operations.</span>
          <span className="muted">
            Already have a school? Sign in at your own address, not this one.
          </span>
        </div>
      </footer>
    </div>
  );
}
