// /book — the walkthrough button's destination, shaped like Calendly because
// that is the shape people already know: a month calendar of available days,
// a column of times for the picked day, then name and email. Open times are
// GENERATED from the recurring availability rules; booked rows only subtract.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentHostKind } from "@/lib/tenant-server";
import { prismaSystem } from "@/lib/db";
import { Notice } from "@/components/ui";
import { expandRules } from "@/lib/availability";
import { BookingPicker } from "./BookingPicker";
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

  // prismaSystem: platform tables, and the one public read of them.
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
  ).map((s) => ({ iso: s.startsAt.toISOString(), durationMin: s.durationMin }));

  return (
    <div className="authplain">
      <main className="bookpage">
        <div className="lockup lockup-hero">
          <TrackView path="/book" />
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

        {sp.booked ? (
          <div className="bookpage-note">
            <Notice tone="good">
              Booked. A confirmation is on its way to your inbox, and the meeting link follows
              from the founder.
            </Notice>
            <p className="small">
              <Link href="/">Back to the front page</Link>
            </p>
          </div>
        ) : (
          <>
            {sp.error === "taken" && (
              <div className="bookpage-note">
                <Notice tone="warn">That time was just taken — pick another.</Notice>
              </div>
            )}
            {sp.error === "form" && (
              <div className="bookpage-note">
                <Notice tone="bad">A time, your name and a working email are all needed.</Notice>
              </div>
            )}

            {slots.length === 0 ? (
              <div className="bookpage-note">
                <div className="notice info">
                  Nothing on the calendar right now. Email{" "}
                  <span className="mono">info@schoolcohort.com</span> and we&apos;ll find a time.
                </div>
              </div>
            ) : (
              <BookingPicker slots={slots} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
