"use client";

// The schools table and its detail panel, client-driven so opening and
// closing a record is instant: every school's panel data is already on the
// page, and the open record lives in the URL via shallow pushState —
// ?school=<id> survives refresh, back/forward works, and nothing round-trips
// to the server just to slide a panel in.

import Link from "next/link";
import { useShallowParams } from "@/components/use-shallow-params";
import { Monogram, AdmPill, Panel, EmptyState, fmtDate, fmtMonthYear } from "../ui";
import { IconDoc, IconMail, IconChat, IconSend } from "../icons";

export type SchoolRow = {
  id: string;
  name: string;
  slug: string;
  state: string;
  providerRail: string;
  joinedIso: string;
  students: number;
  accounts: number;
  families: number;
  paid: number;
  ownerEmail: string | null;
  ownerName: string | null;
  contactPhone: string;
  studentEstimate: number;
  gradesServed: string;
  heardFrom: string;
  priorTooling: string;
  invoices: { id: string; periodStart: string; status: string; amount: number }[];
};

const HEARD_FROM_LABEL: Record<string, string> = {
  search: "Search",
  referral: "Referral from another school",
  social: "Social media",
  walkthrough: "Walkthrough call",
  conference: "Conference or event",
  other: "Somewhere else",
};

const PRIOR_TOOLING_LABEL: Record<string, string> = {
  spreadsheets: "Spreadsheets",
  paper: "Paper and binders",
  another_tool: "Another tool",
  nothing: "Nothing — brand new",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting reimbursement",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
};

export function SchoolsView({ schools }: { schools: SchoolRow[] }) {
  const [params, updateParams] = useShallowParams();
  const open = schools.find((s) => s.id === params.get("school")) ?? null;
  const openSchool = (id: string) => updateParams((p) => p.set("school", id));
  const close = () => updateParams((p) => p.delete("school"));

  return (
    <>
      <div className="adm-screen">
        <div className="adm-eyebrow">Platform</div>
        <h1>Schools</h1>

        <div className="adm-table">
          <div className="adm-thead adm-cols-schools">
            <div>School</div>
            <div>State</div>
            <div>Rail</div>
            <div className="adm-cellr">Students</div>
            <div className="adm-cellr">Accounts</div>
            <div className="adm-cellr">Paid</div>
            <div className="adm-cellr">Joined</div>
          </div>
          {schools.length === 0 ? (
            <EmptyState head="No schools yet">
              Every school that signs up lands here with its students, accounts and reimbursement
              totals.
            </EmptyState>
          ) : (
            schools.map((s, i) => {
              const rowCls =
                s.id === open?.id
                  ? "adm-trow adm-cols-schools adm-trow-active"
                  : "adm-trow adm-cols-schools";
              return (
                <a
                  key={s.id}
                  className={rowCls}
                  href={`/cohort-admin/schools?school=${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    openSchool(s.id);
                  }}
                >
                  <div className="adm-recid">
                    <Monogram name={s.name} index={i} />
                    <span style={{ minWidth: 0 }}>
                      <span className="adm-listname">{s.name}</span>
                      <span className="adm-listsub">{s.slug}</span>
                    </span>
                  </div>
                  <div>
                    <AdmPill tone="info" square>
                      {s.state}
                    </AdmPill>
                  </div>
                  <div className="adm-cellbody">{s.providerRail || "—"}</div>
                  <div className="adm-cellnum">{s.students}</div>
                  <div className="adm-cellnum">{s.accounts}</div>
                  <div className="adm-cellnum adm-cellnum-strong">${s.paid.toLocaleString()}</div>
                  <div className="adm-cellnum" style={{ color: "var(--a-muted-soft)", fontSize: 12.5 }}>
                    {fmtDate(new Date(s.joinedIso))}
                  </div>
                </a>
              );
            })
          )}
        </div>
      </div>

      {open && (
        <Panel
          title={open.name}
          closeHref="/cohort-admin/schools"
          onClose={close}
          meta={
            <>
              <AdmPill tone="info" square>
                {open.state}
              </AdmPill>
              <span>Joined {fmtDate(new Date(open.joinedIso))}</span>
            </>
          }
          footer={
            <>
              <div className="adm-foottotal">
                Reimbursed, all time
                <span className="v">${open.paid.toLocaleString()}</span>
              </div>
              <div className="adm-footgrid">
                <a className="adm-footbtn" href={open.ownerEmail ? `mailto:${open.ownerEmail}` : "mailto:"}>
                  Email owner <IconSend />
                </a>
                <Link className="adm-footbtn adm-footbtn-accent" href="/cohort-admin/email">
                  Compose blast <IconMail size={14} />
                </Link>
              </div>
            </>
          }
        >
          <div className="adm-panelid">
            <span className="adm-panelmono">
              {open.name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("")}
            </span>
            <span className="adm-panelemail">{open.slug}</span>
            <span className="adm-panelactions">
              <a
                className="adm-iconbtn"
                href={open.ownerEmail ? `mailto:${open.ownerEmail}` : "mailto:"}
                aria-label="Email the owner"
              >
                <IconMail size={16} strokeWidth={1.8} />
              </a>
              <Link className="adm-iconbtn" href="/cohort-admin/email" aria-label="Email blasts">
                <IconChat />
              </Link>
            </span>
          </div>

          <div className="adm-panelsec">
            <div className="adm-seclabel">Owner</div>
            <div className="adm-kv">
              <span className="k">Name</span>
              <span className="v">{open.ownerName || "—"}</span>
            </div>
            <div className="adm-kv">
              <span className="k">Email</span>
              <span className="v mono" style={{ fontSize: 12 }}>
                {open.ownerEmail || "—"}
              </span>
            </div>
            <div className="adm-kv">
              <span className="k">Phone</span>
              <span className="v">{open.contactPhone || "—"}</span>
            </div>
          </div>

          <div className="adm-panelsec">
            <div className="adm-seclabel">About the school</div>
            <div className="adm-kv">
              <span className="k">Students expected</span>
              <span className="v">{open.studentEstimate > 0 ? open.studentEstimate : "—"}</span>
            </div>
            <div className="adm-kv">
              <span className="k">Grades served</span>
              <span className="v">{open.gradesServed || "—"}</span>
            </div>
            <div className="adm-kv">
              <span className="k">Found Cohort via</span>
              <span className="v">{HEARD_FROM_LABEL[open.heardFrom] ?? "—"}</span>
            </div>
            <div className="adm-kv">
              <span className="k">Replaced</span>
              <span className="v">{PRIOR_TOOLING_LABEL[open.priorTooling] ?? "—"}</span>
            </div>
          </div>

          <div className="adm-panelsec">
            <div className="adm-seclabel">Enrollment</div>
            <div className="adm-stats3">
              <div className="adm-stattile">
                <div className="n">{open.students}</div>
                <div className="l">Students</div>
              </div>
              <div className="adm-stattile">
                <div className="n">{open.accounts}</div>
                <div className="l">Accounts</div>
              </div>
              <div className="adm-stattile">
                <div className="n">{open.families}</div>
                <div className="l">Families</div>
              </div>
            </div>
            <div className="adm-kv" style={{ marginTop: 10 }}>
              <span className="k">Funding rail</span>
              <span className="v">{open.providerRail || "Not set"}</span>
            </div>
          </div>

          <div className="adm-panelsec">
            <div className="adm-seclabel">Invoices</div>
            {open.invoices.length === 0 ? (
              <p className="adm-cardsub">No invoices yet.</p>
            ) : (
              open.invoices.map((inv) => (
                <div key={inv.id} className="adm-invrow">
                  <span className="adm-invtile">
                    <IconDoc />
                  </span>
                  <span className="adm-listmain">
                    <span className="adm-listname">{fmtMonthYear(inv.periodStart)}</span>
                    <span className="adm-listsub" style={{ fontFamily: "inherit" }}>
                      {INVOICE_STATUS_LABEL[inv.status] ?? inv.status}
                    </span>
                  </span>
                  <span className="adm-cellnum adm-cellnum-strong">
                    ${inv.amount.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>
      )}
    </>
  );
}
