import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { currentHostKind } from "@/lib/tenant-server";
import { rootDomain } from "@/lib/tenant-config";
import { landingStates, LandingState } from "@/lib/landing";

// "/" means two different things depending on the address it arrives on.
//
// On a school's own subdomain, and on any untenanted deployment, it is what it
// has always been: send each role to their home. On the apex it is the public
// marketing page, because there is no school there to send anyone to.
//
// WHAT THIS PAGE MAY CLAIM. Everything here is load-bearing for a school
// deciding whether to run their reimbursements through us, so the limits are on
// the page rather than in the small print, and the state table is DERIVED from
// src/lib/rules.ts rather than written out. A landing page that oversells this
// product gets a microschool's funding rejected, which is a worse outcome than
// a landing page that undersells it.

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cohort — the system that gets a microschool paid",
  description:
    "Attendance, evidence, and ESA reimbursement paperwork for microschools and homeschool co-ops. Correctly, on time, in any state.",
};

/**
 * The early-adopter rate is real: $149/mo flat, locked twelve months. What is
 * still unset is the per-child price that replaces it at launch — the
 * placeholder note under the tiers says so, and the network tier still reads
 * [ talk to us ]. Nothing on this page charges anyone; there is no billing
 * system yet, so early-adopter invoices are a manual affair by design.
 */
const SHOW_PRICING = true;

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
  const root = rootDomain() || "schoolcohort.com";
  const states = landingStates();
  const verifiedCount = states.filter((s) => !s.unverified).length;

  return (
    <div className="lp">
      <div className="lp-card">
        <header className="lp-head">
          <nav className="lp-nav" aria-label="Sections">
            <a href="#how">How it works</a>
            <span className="lp-dot" aria-hidden />
            <a href="#features">What it does</a>
            <span className="lp-dot" aria-hidden />
            <a href="#states">States</a>
            {SHOW_PRICING && (
              <>
                <span className="lp-dot" aria-hidden />
                <a href="#pricing">Pricing</a>
              </>
            )}
          </nav>

          <div className="lp-lockup">
            <Image src="/logo-mark.png" alt="" width={28} height={37} className="lp-markimg" priority />
            <span className="lp-word">Cohort</span>
          </div>

          <div className="lp-headright">
            <Link className="lp-textlink" href="/login">
              Sign in
            </Link>
            <Link className="lp-pill" href="/signup">
              Start your school
              <span className="lp-well" aria-hidden>
                ↗
              </span>
            </Link>
          </div>
        </header>

        {/* Someone typed the bare domain looking for their school. They cannot
            sign in here — the session cookie is host-only, so an account only
            exists at its own address — and the honest answer is to say where to
            look rather than show a form that would not work. */}
        {signin && (
          <div className="lp-find" role="status">
            <strong>Looking for your school?</strong> Each school signs in at its own address, not
            this one — something like <span className="mono">cedar-grove.{root}</span>. It&apos;s in
            the invitation your school sent you. We can&apos;t look a family&apos;s school up from
            here, on purpose.
          </div>
        )}

        <section className="lp-hero">
          <div className="lp-herocopy">
            <span className="lp-badge">
              <span className="lp-badgedot" aria-hidden>
                ✦
              </span>
              Microschool operations + ESA reimbursement
            </span>

            <h1>The system that gets a microschool paid.</h1>

            <p className="lp-lede">
              Take attendance. Cohort turns it into the reimbursement packet your state actually
              accepts — with the evidence attached, in the format the reviewer expects, before the
              deadline.
            </p>

            <div className="lp-ctarow">
              <Link className="lp-pill lp-pill-lg" href="/signup">
                Start your school
                <span className="lp-well" aria-hidden>
                  ↗
                </span>
              </Link>
              <a className="lp-play" href="#how">
                <span className="lp-playdot" aria-hidden>
                  ▶
                </span>
                See a packet get built
              </a>
            </div>
          </div>

          {/* No right padding on purpose: the screenshot bleeds off the card.
              Sized by height with a horizontal crop so there is never vertical
              slack under it, at any width. */}
          <div className="lp-shot">
            <Image
              src="/hero-dashboard.png"
              alt="The Cohort teacher dashboard, showing six students and their evidence scores"
              width={1906}
              height={853}
              priority
            />
          </div>
        </section>

        {/* The handoff's label here read "Built with microschools running ESA
            cycles in". No microschool is running a cycle on Cohort yet, so that
            sentence would have been the page's one outright false claim — and
            on the strip directly under the headline. What IS true is how many
            programs the rules table covers, so the strip says that instead. */}
        <div className="lp-strip">
          <span className="lp-striplabel">
            Reimbursement rules configured for {states.length} states
          </span>
          <div className="lp-stripstates">
            {states.slice(0, 5).map((s) => (
              <span key={s.code}>{s.name}</span>
            ))}
            <span className="lp-stripmore">and {states.length - 5} more</span>
          </div>
        </div>
      </div>

      <main>
        <section className="lp-wrap lp-split lp-job">
          <div>
            <div className="lp-eyebrow">The actual job</div>
            <h2>A microschool with six students is running a claims operation.</h2>
          </div>
          <ul className="lp-joblist">
            <li>
              <span className="lp-bullet" aria-hidden />
              <div>
                <h3>Miss a cycle and payroll is late</h3>
                <p>
                  Everything else in the school depends on this one thing working. It&apos;s the
                  part nobody trained you for and the part with a deadline.
                </p>
              </div>
            </li>
            <li>
              <span className="lp-bullet" aria-hidden />
              <div>
                <h3>Every state words it differently</h3>
                <p>
                  Each program wants a different attendance denominator, a different receipt, a
                  different attestation. The rules change between cycles, and nobody sends you a
                  diff.
                </p>
              </div>
            </li>
            <li>
              <span className="lp-bullet" aria-hidden />
              <div>
                <h3>Evidence, not enthusiasm</h3>
                <p>
                  Rejections are almost never about the teaching. They&apos;re about a missing day,
                  an unsigned line, a work sample nobody kept.
                </p>
              </div>
            </li>
          </ul>
        </section>

        <section className="lp-wrap lp-section" id="how">
          <div className="lp-eyebrow">How it works</div>
          <h2 className="lp-h2">Three things, in this order</h2>

          <div className="lp-3up">
            {[
              [
                "Run your school",
                "Attendance, assignments, grading, portfolios, conferences, messages home. Ordinary daily work — the kind you'd be doing in a spreadsheet anyway.",
              ],
              [
                "Cohort assembles the packet",
                "Attendance counted against your school's own instructional calendar, work samples attached, narrative drafted, all on your letterhead.",
              ],
              [
                "You read it and submit it",
                "Nothing goes anywhere until a person approves it. When a packet comes back rejected, Cohort records the reviewer's exact wording.",
              ],
            ].map(([title, body], i) => (
              <article className="lp-step" key={title}>
                <span className="lp-stepn" aria-hidden>
                  {i + 1}
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>

          {/* The evidence bar, borrowed from the app's own component. The third
              column is a fixed width on purpose: with `auto`, each pill's label
              length changed its row's bar track, and three bars at three
              different scales defeat the comparison the panel exists to make. */}
          <div className="lp-panel">
            <div>
              <div className="lp-eyebrow lp-on-dark">The evidence bar</div>
              <h3>You can see a rejection coming</h3>
              <p>
                Every student carries a live evidence score. Thin packets get flagged weeks before
                the window opens, while there&apos;s still time to fix them.
              </p>
            </div>
            <div className="lp-bars">
              {[
                ["Cole Draper", 2, 0, "Not enough evidence", "bad"],
                ["Maya Reyes", 3, 1, "Likely to be questioned", "warn"],
                ["Eli Booker", 5, 0, "Invoice-ready", "good"],
              ].map(([name, full, partial, label, tone]) => (
                <div className="lp-barrow" key={name as string}>
                  <span className="lp-barname">{name}</span>
                  <span className="lp-bar" aria-hidden>
                    {Array.from({ length: 5 }, (_, i) => (
                      <span
                        key={i}
                        className={
                          i < (full as number)
                            ? "on"
                            : i < (full as number) + (partial as number)
                              ? "half"
                              : ""
                        }
                      />
                    ))}
                  </span>
                  <span className={`lp-chip ${tone}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-wrap lp-section" id="features">
          <div className="lp-headrow">
            <div>
              <div className="lp-eyebrow">What it does</div>
              <h2 className="lp-h2">One system, because it&apos;s all one job</h2>
            </div>
            <p>
              The LMS isn&apos;t a separate feature area from the invoicing. Teaching generates the
              proof, and the proof gets the school paid.
            </p>
          </div>

          <div className="lp-3up">
            {[
              [
                "✓",
                "Attendance",
                "One tap per student, counted against your own instructional calendar. It's the single biggest input to every invoice.",
                true,
              ],
              [
                "✎",
                "Assignments & grading",
                "Quizzes, worksheets, rubrics, a grading queue. Graded work with real feedback is the strongest evidence a state accepts.",
                false,
              ],
              [
                "▤",
                "Portfolios & observations",
                "Work samples and written observations, filed against the student they belong to, ready to attach when the window opens.",
                false,
              ],
              [
                "◈",
                "ESA invoices & packets",
                "Built from the term's real data, on your letterhead, in your state's format. Print or save as PDF and submit it yourself.",
                false,
              ],
              [
                "◐",
                "Cash flow & tuition",
                "What's in flight, what's paid, what's still unbuilt — plus the disbursement lag your state actually runs on.",
                false,
              ],
              [
                "♡",
                "Family portal",
                "Parents get their own view of progress, messages and conferences — and they're the ones who create their child's login.",
                false,
              ],
            ].map(([glyph, title, body, primary]) => (
              <article className="lp-feat" key={title as string}>
                <span className={`lp-tile ${primary ? "mark" : ""}`} aria-hidden>
                  {glyph}
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-wrap lp-section">
          <div className="lp-compare">
            <div className="lp-comparehead">
              <div className="lp-eyebrow">Built for six students, not six hundred</div>
              <h2>Big-school software solves a problem you don&apos;t have</h2>
            </div>
            <div className="lp-comparebody">
              <div className="lp-col">
                <div className="lp-collabel">A district SIS</div>
                {[
                  "Priced and scoped for hundreds of seats",
                  "Assumes a registrar, a bookkeeper and an IT admin",
                  "Knows nothing about ESA reimbursement",
                  "Weeks of setup before the first day counts",
                ].map((t) => (
                  <div className="lp-crow" key={t}>
                    <span className="lp-cmark" aria-hidden>
                      —
                    </span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
              <div className="lp-col lp-col-us">
                <div className="lp-collabel accent">Cohort</div>
                {[
                  "Priced per child, because that's how you're funded",
                  "Assumes one person does all of it, usually while teaching",
                  "Reimbursement is the point, not an integration",
                  "Your own address and your first roster in about a minute",
                ].map((t) => (
                  <div className="lp-crow" key={t}>
                    <span className="lp-cmark on" aria-hidden>
                      ✓
                    </span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="lp-wrap lp-split lp-section" id="states">
          <div>
            <div className="lp-eyebrow">State rules</div>
            <h2>It knows your state&apos;s rules — and admits which ones it hasn&apos;t proven</h2>
            <p className="lp-body">
              A confidently wrong rule gets a school&apos;s funding clawed back. So any rule Cohort
              has inferred but not yet watched survive a real invoice cycle carries a visible flag,
              and you treat it as a starting point rather than as advice.
            </p>
            <div className="lp-callout">⚑ Unverified rules are marked, everywhere they appear</div>
            <p className="lp-fine">
              {states.length} programs configured, {verifiedCount} confirmed against a real invoice
              cycle. Any other state works too — the teaching and evidence side is the same
              everywhere.{" "}
              <Link className="lp-textlink" href="/states">
                Read the state-by-state guide →
              </Link>
            </p>
          </div>

          {/* Driven from src/lib/rules.ts, never written out. The handoff is
              explicit that this table must not be able to claim more coverage
              than the code has verified — and every rail is still verify:true,
              so every row carries the flag. */}
          <div className="lp-states">
            {states.map((s: LandingState) => (
              <div className="lp-state" key={s.code}>
                <div>
                  <div className="lp-statename">{s.name}</div>
                  <div className="lp-stateprog">{s.program}</div>
                </div>
                <span className={`lp-chip ${s.unverified ? "warn" : "good"}`}>
                  {s.unverified ? "⚑ Rules unverified" : "Supported"}
                </span>
              </div>
            ))}
            <div className="lp-state lp-state-add">[ add states as cycles are observed ]</div>
          </div>
        </section>

        <section className="lp-wrap lp-section">
          <div className="lp-limits">
            <div className="lp-eyebrow">What Cohort will not do</div>
            <h2>The limits, up front</h2>
            <div className="lp-limitgrid">
              {[
                [
                  "It never holds your money.",
                  "Reimbursements go from the state or the ESA vendor to you. Cohort is never in that path and never has a balance of yours.",
                ],
                [
                  "It never submits for you.",
                  "AI drafts; a person approves; nothing is auto-filed. A system that could submit on its own could submit something wrong on its own.",
                ],
                [
                  "It flags what it hasn't verified.",
                  "A rule Cohort inferred but has not yet seen hold up against a real invoice carries a visible mark.",
                ],
                [
                  "Children's accounts come from parents.",
                  "A school cannot create a student login. A parent does, with consent recorded — and child records are deleted on a schedule you set.",
                ],
              ].map(([lead, rest]) => (
                <p key={lead}>
                  <strong>{lead}</strong> {rest}
                </p>
              ))}
            </div>
          </div>
        </section>

        {SHOW_PRICING && (
          <section className="lp-wrap lp-section" id="pricing">
            <div className="lp-centerhead">
              <div className="lp-eyebrow">Pricing</div>
              <h2 className="lp-h2">The first cohort pays one flat rate</h2>
              <p>
                At launch, Cohort will be priced per child — because that&apos;s how you&apos;re
                funded. While it&apos;s early, it&apos;s simpler than that: everything, every
                student, one rate, locked for your first twelve months. Free until your first
                children are enrolled.
              </p>
            </div>

            <div className="lp-3up lp-tiers">
              <article className="lp-tier">
                <h3>Setting up</h3>
                <p className="lp-tiersub">Your address, your calendar, your first roster.</p>
                <div className="lp-price">Free</div>
                <div className="lp-pricenote">No card, no expiry</div>
                <div className="lp-hair" />
                <ul>
                  <li>Full product, one school</li>
                  <li>Attendance and grading</li>
                  <li>Packets you can preview</li>
                </ul>
              </article>

              <article className="lp-tier featured">
                <div className="lp-tierhead">
                  <h3>The first cohort</h3>
                  <span className="lp-expect">First 25 schools</span>
                </div>
                <p className="lp-tiersub">Everything, for every enrolled student.</p>
                <div className="lp-price">$149</div>
                <div className="lp-pricenote">
                  per month, flat — any number of students. Billed monthly, cancel anytime.
                </div>
                <div className="lp-hair" />
                <ul>
                  <li>ESA packets in your state&apos;s format</li>
                  <li>Evidence board and rejection tracking</li>
                  <li>Family portal and portfolios</li>
                  <li>Your own school address</li>
                  <li>Rate locked for your first 12 months</li>
                  <li>A direct line to the founder while it&apos;s early</li>
                </ul>
                <Link className="lp-pill lp-pill-full" href="/signup">
                  Start your school
                </Link>
                <div className="lp-pricenote" style={{ textAlign: "center", marginTop: 10 }}>
                  Limited to the first 25 schools.
                </div>
              </article>

              <article className="lp-tier">
                <h3>Co-op or network</h3>
                <p className="lp-tiersub">
                  Several schools under one roof, or one operator running a few sites.
                </p>
                <div className="lp-slot">
                  <span className="lp-slotbox neutral">[ talk to us ]</span>
                </div>
                <div className="lp-pricenote">Volume rate per child</div>
                <div className="lp-hair" />
                <ul>
                  <li>Multiple schools, one login</li>
                  <li>Shared calendar and rules</li>
                  <li>Onboarding help</li>
                </ul>
              </article>
            </div>

            <p className="lp-placeholder">
              [ per-child launch pricing not set — the first cohort keeps $149/mo for their
              first year regardless ]
            </p>
          </section>
        )}

        <section className="lp-wrap lp-split lp-section" id="faq">
          <div>
            <div className="lp-eyebrow">Questions</div>
            <h2>Before you move a school onto it</h2>
          </div>
          <div className="lp-faq">
            {[
              [
                "Do you submit my invoices to the state?",
                "No. Cohort prepares and tracks; you submit. Nothing is ever auto-filed to a state portal, a payment rail, or a parent.",
              ],
              [
                "What does the AI actually do?",
                "It drafts narratives from work you've already recorded. A person reads and approves every one before it leaves the building.",
              ],
              [
                "My state isn't listed. Can I still use it?",
                "Yes — the school, teaching and evidence side works anywhere. Packet formatting is state-specific, and states get added as real invoice cycles are observed.",
              ],
              [
                "What happens to student data?",
                "It's yours. Parents create their children's accounts with consent recorded, records are deleted on a retention schedule you set, and a data processing agreement is available.",
              ],
              [
                "How long does setup take?",
                "Pick a name and a state and you have your own address in about a minute. Attendance can start the same day; evidence accumulates from there.",
              ],
              [
                "I already have a spreadsheet that works.",
                "Then you already do step one. The difference is that Cohort keeps the evidence attached to the day it came from, so the packet is built before the window opens rather than the weekend after it closes.",
              ],
            ].map(([q, a]) => (
              <div className="lp-qa" key={q}>
                <h3>{q}</h3>
                <p>{a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-wrap lp-section" id="start">
          <div className="lp-final">
            <h2>Start your school on Cohort</h2>
            <p>You&apos;ll pick a name and a state, and get your own address in about a minute.</p>
            <div className="lp-finalrow">
              {/* The one place the mark colour carries a primary action. */}
              <Link className="lp-markbtn" href="/signup">
                Start your school
                <span aria-hidden>↗</span>
              </Link>
              <span className="lp-finalfine">
                Free to set up. Your school gets its own address at{" "}
                <span className="mono">yourschool.{root}</span>
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-footin">
          <div className="lp-lockup">
            <Image src="/logo-mark.png" alt="" width={24} height={31} className="lp-markimg" />
            <span className="lp-word">Cohort</span>
            <span className="lp-footnote">— microschool operations.</span>
          </div>
          <nav className="lp-footlinks" aria-label="Footer">
            <a href="#how">How it works</a>
            <a href="#states">States</a>
            {SHOW_PRICING && <a href="#pricing">Pricing</a>}
            <a href="#faq">FAQ</a>
            {/* The handoff's footer ends with a Privacy link. There is no
                /privacy route — docs/PRIVACY_POLICY.md is an attorney-review-
                required template, and publishing it as this site's live policy
                is not a call to make in a redesign. Restore the link the same
                day the page exists; a public marketing site collecting signups
                wants one, and CCPA notice-at-collection assumes it. */}
          </nav>
          <span className="lp-footnote">
            Already have a school? Sign in at your own address, not this one.
          </span>
        </div>
      </footer>
    </div>
  );
}
