// /find — "I lost my school's sign-in address."
//
// This page renders a single email field and never anything else: no school
// names, no search results, no did-that-match feedback. The answer to "which
// school?" goes to the inbox that asked (see actions.ts), because a page that
// answered on screen would be a public directory of customer schools.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentHostKind } from "@/lib/tenant-server";
import { findMySchool } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Find your school — Cohort" };

export default async function FindSchool({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const kind = await currentHostKind();
  // On a school's own address this page is meaningless — that address IS the
  // answer. And untenanted deployments have exactly one login to find.
  if (kind.kind !== "apex") redirect("/");

  const { sent } = await searchParams;

  return (
    <div className="authplain">
      <main className="authcol">
        <div className="lockup">
          <Image src="/logo-mark.png" alt="" width={30} height={39} className="brand-markimg" />
          <div>
            <div className="wordmark">Cohort</div>
            <div className="tagline">Run the school. Get paid for it.</div>
          </div>
        </div>

        <h1>Find your school</h1>

        {sent ? (
          <>
            <div className="notice good">
              If that email belongs to a school on Cohort, its sign-in address is on the way to
              your inbox.
            </div>
            <p className="small muted">
              Nothing arrives? Check spam, or ask your school to re-send your invitation — they
              can do it in a click.
            </p>
            <p className="small">
              <Link href="/">Back to the front page</Link>
            </p>
          </>
        ) : (
          <>
            <p className="small muted">
              Every school on Cohort signs in at its own address. Enter the email your school has
              for you and we&apos;ll send that address to your inbox — the page itself can&apos;t
              show it, on purpose.
            </p>
            <form action={findMySchool} className="card2 authcard">
              <label htmlFor="email">Your email</label>
              <input id="email" name="email" type="email" required autoComplete="email" />
              <button className="btn" style={{ marginTop: 14, width: "100%" }}>
                Email me my sign-in address
              </button>
            </form>
            <p className="small muted" style={{ marginTop: 14 }}>
              Starting a new school instead? <Link href="/signup">Create one here</Link>.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
