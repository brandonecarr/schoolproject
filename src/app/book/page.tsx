// /book — the walkthrough button's destination: pick a time, leave a name
// and email, done. Slots render in the visitor's own timezone (LocalTime),
// and a claimed slot vanishes from here the moment it's taken.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentHostKind } from "@/lib/tenant-server";
import { prismaSystem } from "@/lib/db";
import { Notice } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { expandRules } from "@/lib/availability";
import { bookWalkthrough } from "./actions";
import { TrackView } from "@/components/TrackView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a walkthrough — Cohort" };

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ booked?: string; error?: string }>;
}) {
  const kind = await currentHostKind();
  if (kind.kind !== "apex") redirect("/");

  const sp = await searchParams;

  // prismaSystem: platform tables, and the one public read of them. Open
  // times are GENERATED from the recurring availability rules — booked rows
  // are only subtracted, never shown.
  const [rules, booked] = await Promise.all([
    prismaSystem.availabilityRule.findMany({ orderBy: { createdAt: "asc" } }),
    prismaSystem.walkthroughSlot.findMany({
      where: { startsAt: { gt: new Date() } },
      select: { startsAt: true },
    }),
  ]);
  const slots = expandRules(
    rules,
    new Date(),
    new Set(booked.map((b) => b.startsAt.getTime())),
  ).slice(0, 40);

  return (
    <div className="authplain">
      <TrackView path="/book" />
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

        <h1>Book a walkthrough</h1>

        {sp.booked ? (
          <>
            <Notice tone="good">
              Booked. A confirmation is on its way to your inbox, and the meeting link follows
              from the founder.
            </Notice>
            <p className="small">
              <Link href="/">Back to the front page</Link>
            </p>
          </>
        ) : (
          <>
            {sp.error === "taken" && (
              <Notice tone="warn">That time was just taken — pick another.</Notice>
            )}
            {sp.error === "form" && (
              <Notice tone="bad">A time, your name and a working email are all needed.</Notice>
            )}

            <p className="small muted">
              Twenty minutes with the founder: your state, your paperwork, and whether Cohort
              actually fits. Times are shown in your timezone.
            </p>

            {slots.length === 0 ? (
              <div className="notice info">
                Nothing on the calendar right now. Email{" "}
                <span className="mono">info@schoolcohort.com</span> and we&apos;ll find a time.
              </div>
            ) : (
              <form action={bookWalkthrough} className="card2 authcard">
                <label>Pick a time</label>
                <div className="book-slots">
                  {slots.map((s) => (
                    <label key={s.startsAt.toISOString()} className="book-slot">
                      <input type="radio" name="startsAt" value={s.startsAt.toISOString()} required />
                      <span>
                        <LocalTime iso={s.startsAt.toISOString()} /> · {s.durationMin} min
                      </span>
                    </label>
                  ))}
                </div>

                <label htmlFor="book-name" style={{ marginTop: 14 }}>
                  Your name
                </label>
                <input id="book-name" name="name" required autoComplete="name" />

                <label htmlFor="book-email" style={{ marginTop: 12 }}>
                  Email
                </label>
                <input id="book-email" name="email" type="email" required autoComplete="email" />

                <button className="btn" style={{ marginTop: 14, width: "100%" }}>
                  Book it
                </button>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
