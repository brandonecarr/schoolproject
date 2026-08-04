// The signature element. Six segments, one per evidence part; each fills with
// highlighter-green (--mark) when its threshold is met, or a diagonal hatch when
// partial. Ported from evidenceBar() in the MVP's src/views.js.

import type { EvidencePart } from "@/lib/rules";

export function EvidenceBar({
  parts,
  legend = true,
}: {
  parts: EvidencePart[];
  legend?: boolean;
}) {
  return (
    <>
      <div className="evidence">
        {parts.map((p) => {
          const cls = p.ok ? "on" : p.count > 0 ? "partial" : "";
          return (
            <div
              key={p.key}
              className={`ev-seg ${cls}`}
              title={`${p.label}: ${p.count} — ${p.need}`}
            >
              {p.count}
            </div>
          );
        })}
      </div>
      {legend && (
        <div className="ev-legend">
          {parts.map((p) => (
            <span key={p.key}>{p.label}</span>
          ))}
        </div>
      )}
    </>
  );
}
