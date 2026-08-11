"use client";

// Upcoming bookings with the same slide-out treatment as Schools and Leads:
// click a booking and its detail panel pushes the screen over — the time,
// who booked it, their state and pipeline status, and the two things you'd
// actually do next (email them, open the full lead). URL-backed via
// ?booking=<id>, instant open/close.

import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { useShallowParams } from "../use-shallow-params";
import { Monogram, AdmPill, Panel, LEAD_STATUS_TONE, fmtDate } from "../ui";
import { IconMail, IconUsers, IconSend } from "../icons";

export type BookingRow = {
  id: string;
  startsAtIso: string;
  durationMin: number;
  leadId: string | null;
  leadName: string;
  leadEmail: string;
  leadState: string;
  leadStatus: string;
};

const MONTHS_UP = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function BookingsView({ bookings }: { bookings: BookingRow[] }) {
  const [params, updateParams] = useShallowParams();
  const open = bookings.find((b) => b.id === params.get("booking")) ?? null;
  const close = () => updateParams((p) => p.delete("booking"));

  return (
    <>
      <div className="adm-card">
        <div className="adm-cardtitle">Upcoming bookings</div>
        <div style={{ marginTop: 6 }}>
          {bookings.length === 0 ? (
            <p className="adm-cardsub" style={{ marginTop: 10 }}>
              No bookings yet. Once availability is set, the walkthrough button does the rest.
            </p>
          ) : (
            bookings.map((b) => {
              const d = new Date(b.startsAtIso);
              return (
                <a
                  key={b.id}
                  className="adm-listrow adm-rowlink"
                  href={`/cohort-admin/walkthroughs?booking=${b.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    updateParams((p) => p.set("booking", b.id));
                  }}
                >
                  <div className="adm-dateblock" style={{ width: 64 }}>
                    <div className="adm-datemonth">
                      {MONTHS_UP[d.getUTCMonth()]} {d.getUTCDate()}
                    </div>
                    <div className="adm-datetime">
                      <LocalTime iso={b.startsAtIso} />
                    </div>
                  </div>
                  <div className="adm-listmain">
                    <div className="adm-listname">{b.leadName || "—"}</div>
                    <div className="adm-listsub">{b.leadEmail || "no lead attached"}</div>
                  </div>
                  <AdmPill tone={b.leadId ? "good" : "info"}>{b.leadId ? "Booked" : "Held"}</AdmPill>
                </a>
              );
            })
          )}
        </div>
      </div>

      {open && (
        <Panel
          title={open.leadName || "Held slot"}
          closeHref="/cohort-admin/walkthroughs"
          onClose={close}
          meta={
            <>
              <AdmPill tone={open.leadId ? "good" : "info"}>
                {open.leadId ? "Booked" : "Held"}
              </AdmPill>
              <span>{fmtDate(new Date(open.startsAtIso))}</span>
            </>
          }
          footer={
            open.leadId ? (
              <div className="adm-footgrid">
                <a className="adm-footbtn" href={`mailto:${open.leadEmail}`}>
                  Email lead <IconSend />
                </a>
                <Link
                  className="adm-footbtn adm-footbtn-accent"
                  href={`/cohort-admin/leads?lead=${open.leadId}`}
                >
                  Open in Leads <IconUsers size={14} strokeWidth={2} />
                </Link>
              </div>
            ) : undefined
          }
        >
          <div className="adm-panelid">
            <span className="adm-panelmono adm-panelmono-round">
              {(open.leadName || "?")
                .split(/[\s.@_-]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("")}
            </span>
            <span className="adm-panelemail">{open.leadEmail || "no lead attached"}</span>
            {open.leadEmail && (
              <span className="adm-panelactions">
                <a className="adm-iconbtn" href={`mailto:${open.leadEmail}`} aria-label="Email">
                  <IconMail size={16} strokeWidth={1.8} />
                </a>
              </span>
            )}
          </div>

          <div className="adm-panelsec">
            <div className="adm-kv">
              <span className="k">When</span>
              <span className="v">
                <LocalTime iso={open.startsAtIso} />
              </span>
            </div>
            <div className="adm-kv">
              <span className="k">Length</span>
              <span className="v">{open.durationMin} min</span>
            </div>
            <div className="adm-kv">
              <span className="k">State</span>
              <span className="v">{open.leadState || "—"}</span>
            </div>
            {open.leadId && (
              <div className="adm-kv">
                <span className="k">Pipeline status</span>
                <span className="v">
                  <AdmPill tone={LEAD_STATUS_TONE[open.leadStatus] ?? "info"}>
                    {open.leadStatus}
                  </AdmPill>
                </span>
              </div>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}
