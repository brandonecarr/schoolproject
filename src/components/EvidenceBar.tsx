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
  // The meaning here is carried entirely by colour and fill — green means met,
  // hatched means partial. That is invisible to a screen reader and to anyone
  // who can't distinguish the states, so the same information is spelled out in
  // a list beside it. `title` alone is not enough: it isn't reliably announced
  // and it never appears on touch.
  const met = parts.filter((p) => p.ok).length;

  return (
    <>
      <div className="evidence" role="img" aria-label={`Evidence: ${met} of ${parts.length} requirements met.`}>
        {parts.map((p) => {
          const cls = p.ok ? "on" : p.count > 0 ? "partial" : "";
          return (
            <div
              key={p.key}
              className={`ev-seg ${cls}`}
              title={`${p.label}: ${p.count} — ${p.need}`}
              aria-hidden
            >
              {p.count}
            </div>
          );
        })}
      </div>
      <ul className="sr-only">
        {parts.map((p) => (
          <li key={p.key}>
            {p.label}: {p.count}. {p.ok ? "Met." : `Not met — ${p.need}.`}
          </li>
        ))}
      </ul>
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
