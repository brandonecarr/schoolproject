// Read-only view of annotated work: the image with numbered markers, and the
// notes listed beneath as a key.
//
// The key matters as much as the overlay. A marker alone requires hovering,
// which is impossible on paper and awkward on a phone — and this same component
// backs the student's view of returned work, where the notes ARE the feedback.

import { numbered, pinStyle } from "@/lib/annotate";
import type { Pin } from "@/components/Annotator";

export function PinnedWork({
  fileId,
  pins,
  maxWidth = 420,
  alt = "Turned-in work",
}: {
  fileId: string;
  pins: Pin[];
  maxWidth?: number;
  alt?: string;
}) {
  const marks = numbered(pins);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ position: "relative", display: "inline-block", maxWidth, width: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/files/${fileId}`}
          alt={alt}
          style={{ display: "block", width: "100%", border: "1px solid var(--rule)", borderRadius: 10 }}
        />
        {marks.map((m) => (
          <span key={m.id} className="pin" style={pinStyle(m)}>
            {m.n}
          </span>
        ))}
      </div>

      {marks.length > 0 && (
        <ol className="pinkey">
          {marks.map((m) => (
            <li key={m.id}>
              {m.body}
              <span className="small muted"> — {m.authorName}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
