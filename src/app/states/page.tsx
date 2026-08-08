// /states — the public index of every configured program.
//
// Apex-only, like the landing page: on a school's own address this URL means
// nothing, so it goes home. Same honesty contract too — everything below is
// derived from src/lib/rules.ts via states.ts, and the ⚑ flag travels with any
// rail that has not survived a real invoice cycle.

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentHostKind } from "@/lib/tenant-server";
import { statePages } from "@/lib/states";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ESA & school choice programs by state — Cohort",
  description:
    "Which states fund microschool students, who administers each program, and what the paperwork actually requires. Reimbursement rules for 23 programs, verification status included.",
};

export default async function StatesIndex() {
  const kind = await currentHostKind();
  if (kind.kind !== "apex") redirect("/");

  const states = statePages();
  const verified = states.filter((s) => !s.unverified).length;

  return (
    <div className="lp">
      <div className="lp-card">
        <header className="lp-head">
          <Link className="lp-lockup" href="/">
            <Image src="/logo-mark.png" alt="" width={28} height={37} className="lp-markimg" priority />
            <span className="lp-word">Cohort</span>
          </Link>
          <div className="lp-headright">
            <Link className="lp-textlink" href="/">
              Home
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
          <div className="lp-eyebrow">State programs</div>
          <h1 className="lp-h2">Where the money comes from, state by state</h1>
          <p className="lp-body" style={{ maxWidth: "68ch" }}>
            {states.length} programs configured — ESAs, tax-credit scholarships, vouchers and
            per-pupil allotments — each with the administrator that actually pays the invoice.{" "}
            {verified} confirmed against a real invoice cycle so far; the rest carry a visible ⚑
            until they are. Any other state works too: the attendance, evidence and teaching side
            of Cohort is the same everywhere, there&apos;s just no state program to bill.
          </p>

          <div className="lp-states" style={{ marginTop: 24 }}>
            {states.map((s) => (
              <Link className="lp-state" key={s.code} href={`/states/${s.slug}`}>
                <div>
                  <div className="lp-statename">{s.name}</div>
                  <div className="lp-stateprog">
                    {s.kindLabel}
                    {s.railLabel ? ` · ${s.railLabel}` : ""}
                  </div>
                </div>
                <span className={`lp-chip ${s.unverified ? "warn" : "good"}`}>
                  {s.unverified ? "⚑ Rules unverified" : "Supported"}
                </span>
              </Link>
            ))}
          </div>

          <p className="lp-fine" style={{ marginTop: 18 }}>
            Award figures on these pages are approximate annual amounts for planning — every
            program sets them yearly and several prorate or tier them. The number that counts is
            on the family&apos;s award letter.
          </p>
        </section>
      </div>
    </div>
  );
}
