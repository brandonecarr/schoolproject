// What we know about a rail, split honestly into what we've SEEN and what we
// merely PREDICTED.
//
// The old version of this panel listed rules.ts's invented rejection reasons
// under the heading "Most common rejection reasons", which is a claim we had no
// standing to make — nobody had counted anything. Predictions now sit visibly
// below observations and are labelled as guesses, and a prediction that has
// never once happened is called out rather than left looking authoritative.

import { Pill, VerifyFlag } from "@/components/ui";
import type { Rail } from "@/lib/rules";
import { verificationFor, taxonomyQuality, type Observation } from "@/lib/observations";

export function RailKnowledge({ rail, obs }: { rail: Rail; obs: Observation[] }) {
  const v = verificationFor(obs);
  const q = taxonomyQuality(obs, rail.rejectionReasons);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="spread">
        <div className="eyebrow">What we know about {rail.label}</div>
        <Pill tone={v.tone}>{v.label}</Pill>
      </div>
      <p className="small muted" style={{ margin: "8px 0 0" }}>
        {v.detail}
      </p>

      {v.level !== "confirmed" && (
        <div className="verifybar" aria-hidden style={{ marginTop: 10 }}>
          <span style={{ width: `${Math.round(v.progress * 100)}%` }} />
        </div>
      )}

      {q.novel.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 18 }}>
            Rejections we did not predict
          </div>
          <p className="small muted" style={{ margin: "6px 0 8px" }}>
            These came back from {rail.label} and were not on our list. They are the most valuable
            thing on this page.
          </p>
          <div className="rollbook">
            {q.novel.map((t) => (
              <div key={t.reason} className="line">
                <span style={{ flex: 1 }}>
                  {t.reason}
                  {t.samples.length > 1 && (
                    <span className="small muted"> · {t.samples.length} wordings</span>
                  )}
                </span>
                <span className="mono">×{t.count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {q.hit.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 18 }}>
            Predicted and confirmed
          </div>
          <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
            {q.hit.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}

      {q.unseen.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 18 }}>
            Predicted, never seen
          </div>
          <ul className="small muted" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
            {q.unseen.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {rail.verify && (
            <VerifyFlag>
              {v.decided === 0
                ? "Nothing on this list has been observed — it is a starting guess, not a taxonomy."
                : `${q.unseen.length} of ${rail.rejectionReasons.length} predicted reasons have never actually happened here.`}
            </VerifyFlag>
          )}
        </>
      )}
    </div>
  );
}
