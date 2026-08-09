"use client";

// Bulk slot creation, in the ADMIN'S OWN timezone.
//
// Timezones are the whole difficulty of a booking tool. The rule here: slots
// are entered in the operator's local time (this browser's), converted to
// UTC instants before they leave the page, and stored as instants forever.
// The public /book page does the mirror image — instants in, the visitor's
// local time out. Nobody ever does timezone math by hand.

import { useState } from "react";
import { addSlots } from "../actions";

export function AddSlots() {
  const [date, setDate] = useState("");
  const [times, setTimes] = useState("9:00, 9:30, 10:00");
  const [duration, setDuration] = useState(20);
  const [error, setError] = useState("");

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function buildIsos(): string[] | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const isos: string[] = [];
    for (const raw of times.split(",")) {
      const t = raw.trim();
      if (!t) continue;
      const m = t.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      // Local-time construction: this Date is "that wall-clock time in this
      // browser's zone", and toISOString() is the UTC instant of it.
      const d = new Date(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)) - 1,
        Number(date.slice(8, 10)),
        Number(m[1]),
        Number(m[2])
      );
      if (Number.isNaN(d.getTime())) return null;
      isos.push(d.toISOString());
    }
    return isos.length ? isos : null;
  }

  // A PLAIN server-action form: the client's only job is keeping the hidden
  // `isos` field in sync as the operator types. Submission is the ordinary
  // form POST, so it works identically with and without JavaScript.
  const isos = buildIsos();

  return (
    <form
      action={addSlots}
      onSubmit={(e) => {
        if (!isos) {
          e.preventDefault();
          setError("Need a date and comma-separated times like 9:00, 13:30.");
        } else {
          setError("");
        }
      }}
    >
      <input type="hidden" name="isos" value={JSON.stringify(isos ?? [])} />
      <input type="hidden" name="durationMin" value={duration} />
      <div className="row" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ minWidth: 150 }}>
          <label htmlFor="slot-date">Date</label>
          <input id="slot-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label htmlFor="slot-times">Times ({tz})</label>
          <input
            id="slot-times"
            value={times}
            onChange={(e) => setTimes(e.target.value)}
            placeholder="9:00, 9:30, 14:00"
          />
        </div>
        <div style={{ minWidth: 110 }}>
          <label htmlFor="slot-duration">Minutes</label>
          <input
            id="slot-duration"
            type="number"
            min={10}
            max={120}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 20)}
          />
        </div>
        <button className="btn mark">Add slots</button>
      </div>
      {error && (
        <p className="small" style={{ color: "var(--bad)", marginTop: 8 }}>
          {error}
        </p>
      )}
      <p className="small muted" style={{ marginTop: 8 }}>
        Times are read in your timezone ({tz}) and shown to each visitor in theirs.
      </p>
    </form>
  );
}
