"use client";

// The blast history with the slide-out treatment: click an entry and the
// panel shows what actually went out — audience, recipient count, date, and
// the full body verbatim. The log has always kept the body; this is the
// first place it's readable. URL-backed via ?blast=<id>.

import { useShallowParams } from "@/components/use-shallow-params";
import { AdmPill, Panel, fmtDate } from "../ui";

export type BlastRow = {
  id: string;
  subject: string;
  body: string;
  audience: string;
  sentCount: number;
  createdIso: string;
};

export function BlastsView({ blasts }: { blasts: BlastRow[] }) {
  const [params, updateParams] = useShallowParams();
  const open = blasts.find((b) => b.id === params.get("blast")) ?? null;
  const close = () => updateParams((p) => p.delete("blast"));

  return (
    <>
      <div className="adm-card">
        <div className="adm-cardtitle">History</div>
        <p className="adm-cardsub">Body kept verbatim. Opens are not tracked.</p>
        <div style={{ marginTop: 6 }}>
          {blasts.length === 0 ? (
            <p className="adm-cardsub" style={{ marginTop: 10 }}>
              No blasts yet. The history lands here.
            </p>
          ) : (
            blasts.map((b) => (
              <a
                key={b.id}
                className="adm-listrow adm-rowlink"
                style={{ alignItems: "flex-start" }}
                href={`/cohort-admin/email?blast=${b.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  updateParams((p) => p.set("blast", b.id));
                }}
              >
                <div className="adm-listmain">
                  <div className="adm-listname">{b.subject}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                    <AdmPill tone="info" square>
                      {b.audience}
                    </AdmPill>
                    <span className="adm-cardsub" style={{ margin: 0 }}>
                      {b.sentCount} recipient{b.sentCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="adm-listend">{fmtDate(new Date(b.createdIso))}</div>
              </a>
            ))
          )}
        </div>
      </div>

      {open && (
        <Panel
          title={open.subject}
          closeHref="/cohort-admin/email"
          onClose={close}
          meta={
            <>
              <AdmPill tone="info" square>
                {open.audience}
              </AdmPill>
              <span>Sent {fmtDate(new Date(open.createdIso))}</span>
            </>
          }
        >
          <div className="adm-panelsec" style={{ marginTop: 8 }}>
            <div className="adm-kv">
              <span className="k">Recipients</span>
              <span className="v">{open.sentCount}</span>
            </div>
            <div className="adm-kv">
              <span className="k">Audience</span>
              <span className="v mono" style={{ fontSize: 12 }}>
                {open.audience}
              </span>
            </div>
          </div>
          <div className="adm-panelsec">
            <div className="adm-seclabel">Body — as sent, verbatim</div>
            <div className="adm-noteblock" style={{ whiteSpace: "pre-wrap" }}>
              {open.body}
            </div>
            <p className="adm-cardsub" style={{ marginTop: 10 }}>
              The identity and opt-out footer was appended after this text.
            </p>
          </div>
        </Panel>
      )}
    </>
  );
}
