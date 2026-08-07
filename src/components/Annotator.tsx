"use client";

// Click-to-pin annotation over a student's uploaded image.
//
// Client-side only for placing the marker; the pin itself is saved by a server
// action like everything else. All the arithmetic that could be wrong lives in
// src/lib/annotate.ts where it is tested.
//
// KEYBOARD. The first version of this was mouse-only, which meant a teacher who
// doesn't use a mouse simply could not annotate work — the feature didn't exist
// for them. The image surface is now a focusable control: arrow keys move a
// crosshair, Enter drops the pin. Fine steps with Shift, coarse jumps with
// PageUp/PageDown, corners with Home/End. It is genuinely usable, not a
// compliance gesture.
//
// Existing pins render from the server, so they survive with JavaScript off;
// only placing a NEW one needs the client.

import { useRef, useState } from "react";
import { toFraction, pinStyle, numbered, clamp01 } from "@/lib/annotate";
import { addAnnotation } from "@/app/(teacher)/actions";

export type Pin = {
  id: string;
  x: number;
  y: number;
  body: string;
  authorName: string;
  createdAt: string;
};

/** Arrow-key step as a fraction of the image. 2% is about 8px on a 420px
 *  preview — small enough to be precise, large enough to cross the image in a
 *  couple of seconds rather than fifty keypresses. */
const STEP = 0.02;
const FINE = 0.005;
const COARSE = 0.1;

export function Annotator({
  submissionId,
  fileId,
  pins,
  alt = "Turned-in work",
}: {
  submissionId: string;
  fileId: string;
  pins: Pin[];
  alt?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  // Where the keyboard crosshair sits. Separate from `draft` so arrowing around
  // doesn't open the comment box on every keypress.
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const marks = numbered(pins);

  function place(e: React.MouseEvent<HTMLDivElement>) {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = toFraction({ x: e.clientX, y: e.clientY }, r);
    // null means the image hasn't laid out yet — better to ignore the click
    // than to drop a pin at a coordinate we can't compute.
    if (f) {
      setCursor(f);
      setDraft(f);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? FINE : STEP;

    // Enter/Escape act on the current position, so they read state directly.
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setCursor((c) => {
        const at = c ?? { x: 0.5, y: 0.5 };
        setDraft(at);
        return at;
      });
      return;
    }
    if (e.key === "Escape") {
      setDraft(null);
      return;
    }

    // Movement uses the FUNCTIONAL form deliberately. Reading `cursor` from the
    // closure looks equivalent and isn't: a held-down arrow fires keydown far
    // faster than React re-renders, so every press in a burst would read the
    // same stale position and all but the last would be lost. Holding a key to
    // cross the image is the whole point of the keyboard path.
    const move = (fn: (c: { x: number; y: number }) => { x: number; y: number }) => {
      e.preventDefault();
      setCursor((c) => fn(c ?? { x: 0.5, y: 0.5 }));
    };

    switch (e.key) {
      case "ArrowLeft":
        return move((c) => ({ x: clamp01(c.x - step), y: c.y }));
      case "ArrowRight":
        return move((c) => ({ x: clamp01(c.x + step), y: c.y }));
      case "ArrowUp":
        return move((c) => ({ x: c.x, y: clamp01(c.y - step) }));
      case "ArrowDown":
        return move((c) => ({ x: c.x, y: clamp01(c.y + step) }));
      case "PageUp":
        return move((c) => ({ x: c.x, y: clamp01(c.y - COARSE) }));
      case "PageDown":
        return move((c) => ({ x: c.x, y: clamp01(c.y + COARSE) }));
      case "Home":
        return move(() => ({ x: 0, y: 0 }));
      case "End":
        return move(() => ({ x: 1, y: 1 }));
      default:
        // Don't swallow anything else — Tab must still escape the surface.
        return;
    }
  }


  const pct = (n: number) => Math.round(n * 100);

  return (
    <div style={{ marginTop: 10 }}>
      <div
        ref={wrapRef}
        className="annot-surface"
        onClick={place}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="application"
        aria-label={`${alt}. Arrow keys move the crosshair, Enter adds a note at that spot. ${marks.length} note${marks.length === 1 ? "" : "s"} so far.`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/files/${fileId}`}
          alt={alt}
          style={{ display: "block", width: "100%", border: "1px solid var(--rule)", borderRadius: 10 }}
        />
        {marks.map((m) => (
          <span key={m.id} className="pin" style={pinStyle(m)} title={m.body}>
            {m.n}
          </span>
        ))}
        {cursor && !draft && <span className="annot-crosshair" style={pinStyle(cursor)} aria-hidden />}
        {draft && (
          <span className="pin draft" style={pinStyle(draft)} aria-hidden>
            +
          </span>
        )}
      </div>

      {/* Announced to a screen reader as the crosshair moves, without stealing
          focus. Percentages rather than pixels, since that's what gets stored. */}
      <p className="sr-only" aria-live="polite">
        {cursor ? `Crosshair at ${pct(cursor.x)} percent across, ${pct(cursor.y)} percent down.` : ""}
      </p>

      {draft ? (
        <form action={addAnnotation} className="card" style={{ marginTop: 10, maxWidth: 420 }}>
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="x" value={draft.x} />
          <input type="hidden" name="y" value={draft.y} />
          <label htmlFor={`note-${submissionId}`}>
            Note at {pct(draft.x)}% across, {pct(draft.y)}% down
          </label>
          <textarea
            id={`note-${submissionId}`}
            name="body"
            rows={2}
            required
            autoFocus
            placeholder="Check the carrying here — the tens column is one short."
          />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn sm">Add pin</button>
            <button type="button" className="btn ghost sm" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="annot-help">
          Click the image to pin a note to a spot — or focus it and use the arrow keys, then Enter.
          Pins go to the student with their feedback, and appear in the ESA packet.
        </p>
      )}
    </div>
  );
}
