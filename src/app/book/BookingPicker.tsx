"use client";

// The Calendly-shaped booking flow: a month calendar where only days with
// open times are clickable, a column of times for the picked day, and — once
// a time is chosen — the contact details revealed BENEATH the calendar, with
// a gentle scroll down to them. The calendar never leaves the screen, so
// changing your mind is a click, not a back-button.
//
// Everything renders in the VISITOR's timezone, which is why this is a client
// component: the server does not know it. Until hydration we show a quiet
// placeholder — the grid needs the browser's clock to be honest.

import { useEffect, useMemo, useRef, useState } from "react";
import { bookWalkthrough } from "./actions";

type Slot = { iso: string; durationMin: number };

const pad = (n: number) => String(n).padStart(2, "0");
const dayKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function BookingPicker({ slots }: { slots: Slot[] }) {
  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState<{ y: number; m: number } | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);
  const [selIso, setSelIso] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Group open times by the visitor's local calendar day.
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = dayKeyOf(new Date(s.iso));
      const list = m.get(key) ?? [];
      list.push(s);
      m.set(key, list);
    }
    return m;
  }, [slots]);

  useEffect(() => {
    setMounted(true);
    const first = [...byDay.keys()].sort()[0];
    const d = first ? new Date(`${first}T12:00:00`) : new Date();
    setAnchor({ y: d.getFullYear(), m: d.getMonth() });
  }, [byDay]);

  // The reveal: once Next is hit, bring the details into view.
  useEffect(() => {
    if (showForm && selIso) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showForm, selIso]);

  if (!mounted || !anchor) {
    return <div className="bookc bookc-loading">Loading the calendar…</div>;
  }

  const dayKeys = [...byDay.keys()].sort();
  const lastDay = dayKeys[dayKeys.length - 1] ?? dayKeyOf(new Date());
  const last = new Date(`${lastDay}T12:00:00`);
  const now = new Date();
  const canPrev = anchor.y * 12 + anchor.m > now.getFullYear() * 12 + now.getMonth();
  const canNext = anchor.y * 12 + anchor.m < last.getFullYear() * 12 + last.getMonth();

  const firstDow = new Date(anchor.y, anchor.m, 1).getDay();
  const daysInMonth = new Date(anchor.y, anchor.m + 1, 0).getDate();
  const todayKey = dayKeyOf(now);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const duration = slots[0]?.durationMin ?? 20;
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const dayFmt = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  const fullFmt = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  const selSlots = selDay ? (byDay.get(selDay) ?? []) : [];
  const formOpen = showForm && selIso !== null;

  return (
    <div className="bookc">
      <div className="bookc-row">
        <aside className="bookc-left">
          <div className="bookc-host">Cohort</div>
          <h2 className="bookc-title">Walkthrough with the founder</h2>
          <div className="bookc-meta">
            <span aria-hidden>🕑</span> {duration} min
          </div>
          {selIso ? (
            <div className="bookc-meta bookc-chosen">
              <span aria-hidden>📅</span> {fullFmt.format(new Date(selIso))}
            </div>
          ) : (
            <p className="bookc-desc">
              Your state, your paperwork, and whether Cohort actually fits. Video link arrives by
              email.
            </p>
          )}
          <div className="bookc-meta">
            <span aria-hidden>🌐</span> {tz.replace(/_/g, " ")}
          </div>
        </aside>

        <div className="bookc-main">
          <h3 className="bookc-step">Select a Date &amp; Time</h3>
          <div className="calnav">
            <span className="calnav-month">
              {MONTHS[anchor.m]} {anchor.y}
            </span>
            <span>
              <button
                type="button"
                className="calnav-btn"
                aria-label="Previous month"
                disabled={!canPrev}
                onClick={() => setAnchor({ y: anchor.m === 0 ? anchor.y - 1 : anchor.y, m: (anchor.m + 11) % 12 })}
              >
                ‹
              </button>
              <button
                type="button"
                className="calnav-btn"
                aria-label="Next month"
                disabled={!canNext}
                onClick={() => setAnchor({ y: anchor.m === 11 ? anchor.y + 1 : anchor.y, m: (anchor.m + 1) % 12 })}
              >
                ›
              </button>
            </span>
          </div>
          <div className="calgrid">
            {DOW.map((d) => (
              <div key={d} className="caldow">
                {d}
              </div>
            ))}
            {Array.from({ length: firstDow }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const key = `${anchor.y}-${pad(anchor.m + 1)}-${pad(i + 1)}`;
              const open = byDay.has(key);
              const cls =
                key === selDay
                  ? "calday calday-on calday-sel"
                  : open
                    ? "calday calday-on"
                    : key === todayKey
                      ? "calday calday-today"
                      : "calday";
              return (
                <button
                  key={key}
                  type="button"
                  className={cls}
                  disabled={!open}
                  onClick={() => {
                    setSelDay(key);
                    setSelIso(null);
                    setShowForm(false);
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {selDay && (
          <div className="bookc-times">
            <div className="bookc-timesday">{dayFmt.format(new Date(`${selDay}T12:00:00`))}</div>
            <div className="timeslist">
              {selSlots.map((s) => {
                const active = s.iso === selIso;
                return active ? (
                  <div key={s.iso} className="timerow">
                    <span className="timebtn timebtn-sel">{timeFmt.format(new Date(s.iso))}</span>
                    <button type="button" className="nextbtn" onClick={() => setShowForm(true)}>
                      Next
                    </button>
                  </div>
                ) : (
                  <button
                    key={s.iso}
                    type="button"
                    className="timebtn"
                    onClick={() => {
                      setSelIso(s.iso);
                      setShowForm(false);
                    }}
                  >
                    {timeFmt.format(new Date(s.iso))}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {formOpen && (
        <div ref={formRef} className="bookc-formsec">
          <h3 className="bookc-step">Enter Details</h3>
          <p className="bookc-formwhen">
            {fullFmt.format(new Date(selIso!))} · {duration} min
          </p>
          <form action={bookWalkthrough} className="bookc-form">
            <input type="hidden" name="startsAt" value={selIso ?? ""} />
            <label htmlFor="book-name">Name</label>
            <input id="book-name" name="name" required autoComplete="name" />
            <label htmlFor="book-email" style={{ marginTop: 12 }}>
              Email
            </label>
            <input id="book-email" name="email" type="email" required autoComplete="email" />
            <button className="btn" style={{ marginTop: 16 }}>
              Schedule Event
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
