"use client";

// Click-to-pin annotation over a student's uploaded image.
//
// Client-side only for placing the marker; the pin itself is saved by a server
// action like everything else. The interactive part is genuinely small — take a
// click, convert it to a fraction of the image, show a comment box — and all
// the arithmetic that could be wrong lives in src/lib/annotate.ts where it is
// tested.
//
// Existing pins render from the server, so they survive with JavaScript off;
// only placing a NEW one needs the client.

import { useRef, useState } from "react";
import { toFraction, pinStyle, numbered } from "@/lib/annotate";
import { addAnnotation } from "@/app/(teacher)/actions";

export type Pin = {
  id: string;
  x: number;
  y: number;
  body: string;
  authorName: string;
  createdAt: string;
};

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
  const marks = numbered(pins);

  function place(e: React.MouseEvent<HTMLDivElement>) {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = toFraction({ x: e.clientX, y: e.clientY }, r);
    // null means the image hasn't laid out yet — better to ignore the click
    // than to drop a pin at a coordinate we can't compute.
    if (f) setDraft(f);
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div
        ref={wrapRef}
        onClick={place}
        style={{ position: "relative", display: "inline-block", maxWidth: 420, cursor: "crosshair" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/files/${fileId}`}
          alt={alt}
          style={{
            display: "block",
            width: "100%",
            border: "1px solid var(--rule)",
            borderRadius: 10,
          }}
        />
        {marks.map((m) => (
          <span key={m.id} className="pin" style={pinStyle(m)} title={m.body}>
            {m.n}
          </span>
        ))}
        {draft && <span className="pin draft" style={pinStyle(draft)} aria-hidden>+</span>}
      </div>

      {draft ? (
        <form action={addAnnotation} className="card" style={{ marginTop: 10, maxWidth: 420 }}>
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="x" value={draft.x} />
          <input type="hidden" name="y" value={draft.y} />
          <label htmlFor={`note-${submissionId}`}>Note at this spot</label>
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
        <p className="small muted" style={{ margin: "6px 0 0", maxWidth: 420 }}>
          Click the image to pin a note to a specific spot. Pins go to the student with their
          feedback, and appear in the ESA packet.
        </p>
      )}
    </div>
  );
}
