// Read-only rendering of a curated portfolio. Shared by the parent view, the
// teacher view and the printable version so all three show what the student
// actually arranged.

import { Markdown } from "@/components/Markdown";
import { fmt } from "@/lib/dates";
import type { PortfolioPiece } from "@/lib/portfolio-read";

export function PortfolioPieces({
  pieces,
  studentName,
  emptyNote,
}: {
  pieces: PortfolioPiece[];
  studentName: string;
  emptyNote: string;
}) {
  if (pieces.length === 0) return <p className="small muted">{emptyNote}</p>;

  return (
    <>
      {pieces.map((p, i) => (
        <div key={p.id} className="card" style={{ marginTop: 12 }}>
          <div className="spread">
            <div>
              <div className="eyebrow">
                {i + 1} of {pieces.length} · {p.sourceLabel}
                {p.score ? ` · ${p.score}` : ""}
                {p.when ? ` · ${fmt(p.when.slice(0, 10))}` : ""}
              </div>
              <h3 style={{ margin: "4px 0 0" }}>{p.title}</h3>
            </div>
          </div>

          {p.fileId && p.isImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/files/${p.fileId}`}
              alt={p.title}
              style={{
                display: "block",
                maxWidth: 380,
                width: "100%",
                marginTop: 10,
                border: "1px solid var(--rule)",
                borderRadius: 10,
              }}
            />
          )}
          {p.fileId && !p.isImage && (
            <a className="reslink small" href={`/files/${p.fileId}`} target="_blank" rel="noreferrer">
              ▤ Open the attached file
            </a>
          )}

          {p.reflection ? (
            <blockquote
              style={{
                margin: "12px 0 0",
                paddingLeft: 14,
                borderLeft: "3px solid var(--mark)",
              }}
            >
              <Markdown text={p.reflection} format={p.reflectionFormat} />
              <div className="small muted" style={{ marginTop: 4 }}>
                — {studentName}
              </div>
            </blockquote>
          ) : (
            <p className="small muted" style={{ margin: "10px 0 0" }}>
              No reflection written yet.
            </p>
          )}

          {p.addedByRole === "teacher" && (
            <p className="small muted" style={{ margin: "8px 0 0" }}>
              Chosen by {p.addedByName}.
            </p>
          )}
        </div>
      ))}
    </>
  );
}
