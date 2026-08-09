// /cohort-admin/leads — the pipeline. Status chips filter the table, a row
// opens the lead in the right-hand panel, and "Add a lead" opens the create
// form in the same panel. All three panel states are URL-backed
// (?lead=<id>, ?new=lead) so refresh and action redirects keep them open.
//
// prismaSystem: leads are a platform table — there is no tenant to scope to.

import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { US_STATES } from "@/lib/us-states";
import { LocalTime } from "@/components/LocalTime";
import {
  Monogram,
  AdmPill,
  AdmNotice,
  Panel,
  EmptyState,
  fmtDate,
  LEAD_STATUS_TONE,
} from "../ui";
import { IconPlus, IconMail, IconCalendar, IconSend } from "../icons";
import { addLead, setLeadStatus } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leads — Cohort Admin" };

const STATUSES = ["new", "contacted", "scheduled", "won", "lost"] as const;

export default async function AdminLeads({
  searchParams,
}: {
  searchParams: Promise<{
    added?: string;
    removed?: string;
    error?: string;
    status?: string;
    lead?: string;
    new?: string;
  }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const filter = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? sp.status : undefined;

  const leads = await prismaSystem.lead.findMany({ orderBy: { createdAt: "desc" } });
  const shown = filter ? leads.filter((l) => l.status === filter) : leads;
  const countByStatus = new Map<string, number>();
  for (const l of leads) countByStatus.set(l.status, (countByStatus.get(l.status) ?? 0) + 1);

  const open = sp.lead ? (leads.find((l) => l.id === sp.lead) ?? null) : null;
  const creating = !open && sp.new === "lead";
  const openBooking = open
    ? await prismaSystem.walkthroughSlot.findFirst({ where: { leadId: open.id } })
    : null;

  const listHref = filter ? `/cohort-admin/leads?status=${filter}` : "/cohort-admin/leads";
  const openHref = open ? `${listHref}${filter ? "&" : "?"}lead=${open.id}` : listHref;

  const chip = (label: string, href: string, on: boolean, count: number) => {
    const cls = on ? "adm-chip adm-chip-on" : "adm-chip";
    return (
      <Link key={label} className={cls} href={href}>
        {label}
        <span className="adm-chipcount">{count}</span>
      </Link>
    );
  };

  return (
    <>
      <div className="adm-screen">
        <div className="adm-eyebrow">Pipeline</div>
        <div className="adm-h1row">
          <h1>Leads</h1>
          <Link className="adm-btn" href={`${listHref}${filter ? "&" : "?"}new=lead`}>
            <IconPlus /> Add a lead
          </Link>
        </div>

        {sp.added && <AdmNotice tone="good">Lead added.</AdmNotice>}
        {sp.removed && <AdmNotice tone="good">Lead removed.</AdmNotice>}
        {sp.error === "email" && <AdmNotice tone="bad">That email doesn&apos;t look right.</AdmNotice>}

        <div className="adm-chips">
          {chip("all", "/cohort-admin/leads", !filter, leads.length)}
          {STATUSES.map((s) =>
            chip(s, `/cohort-admin/leads?status=${s}`, filter === s, countByStatus.get(s) ?? 0),
          )}
        </div>

        <div className="adm-table">
          <div className="adm-thead adm-cols-leads">
            <div>Lead</div>
            <div>Note</div>
            <div>Source</div>
            <div>Status</div>
            <div className="adm-cellr">Added</div>
          </div>
          {shown.length === 0 ? (
            <EmptyState
              head={filter ? `No ${filter} leads` : "No leads yet"}
              action={
                <Link className="adm-btn adm-btn-accent" href={`${listHref}${filter ? "&" : "?"}new=lead`}>
                  <IconPlus /> Add a lead
                </Link>
              }
            >
              They&apos;ll land here from the walkthrough button once booking is wired up — or add
              one after a call.
            </EmptyState>
          ) : (
            shown.map((l, i) => {
              const rowCls =
                l.id === open?.id ? "adm-trow adm-cols-leads adm-trow-active" : "adm-trow adm-cols-leads";
              return (
                <Link key={l.id} className={rowCls} href={`${listHref}${filter ? "&" : "?"}lead=${l.id}`}>
                  <div className="adm-recid">
                    <Monogram name={l.name || l.email} index={i + 2} round />
                    <span style={{ minWidth: 0 }}>
                      <span className="adm-listname">{l.name || "—"}</span>
                      <span className="adm-listsub">{l.email}</span>
                    </span>
                  </div>
                  <div className="adm-cellbody">{l.note || "—"}</div>
                  <div className="adm-cellbody adm-cellcap">{l.source}</div>
                  <div>
                    <AdmPill tone={LEAD_STATUS_TONE[l.status] ?? "info"}>{l.status}</AdmPill>
                  </div>
                  <div className="adm-cellnum" style={{ color: "var(--a-muted-soft)", fontSize: 12.5 }}>
                    {fmtDate(l.createdAt)}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {open && (
        <Panel
          title={open.name || open.email}
          closeHref={listHref}
          meta={
            <>
              <AdmPill tone={LEAD_STATUS_TONE[open.status] ?? "info"}>{open.status}</AdmPill>
              <span>Added {fmtDate(open.createdAt)}</span>
            </>
          }
          footer={
            <>
              <form action={setLeadStatus} style={{ marginBottom: 12 }}>
                <input type="hidden" name="id" value={open.id} />
                <input type="hidden" name="back" value={openHref} />
                <label htmlFor="lead-status">Status</label>
                <div style={{ display: "flex", gap: 9 }}>
                  <select id="lead-status" name="status" defaultValue={open.status}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button className="adm-btn" style={{ flex: "none" }}>
                    Set
                  </button>
                </div>
              </form>
              <div className="adm-footgrid">
                <a className="adm-footbtn" href={`mailto:${open.email}`}>
                  Email lead <IconSend />
                </a>
                <form action={setLeadStatus} style={{ display: "contents" }}>
                  <input type="hidden" name="id" value={open.id} />
                  <input type="hidden" name="status" value="won" />
                  <input type="hidden" name="back" value={openHref} />
                  <button className="adm-footbtn adm-footbtn-accent">Mark won</button>
                </form>
              </div>
            </>
          }
        >
          <div className="adm-panelid">
            <span className="adm-panelmono adm-panelmono-round">
              {(open.name || open.email)
                .split(/[\s.@_-]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("")}
            </span>
            <span className="adm-panelemail">{open.email}</span>
            <span className="adm-panelactions">
              <a className="adm-iconbtn" href={`mailto:${open.email}`} aria-label="Email">
                <IconMail size={16} strokeWidth={1.8} />
              </a>
              <Link className="adm-iconbtn" href="/cohort-admin/walkthroughs" aria-label="Calendar">
                <IconCalendar size={16} strokeWidth={1.8} />
              </Link>
            </span>
          </div>

          <div className="adm-panelsec">
            <div className="adm-kv">
              <span className="k">Source</span>
              <span className="v adm-cellcap">{open.source}</span>
            </div>
            <div className="adm-kv">
              <span className="k">State</span>
              <span className="v">{open.state || "—"}</span>
            </div>
            <div className="adm-kv">
              <span className="k">Campaign</span>
              <span className="v mono">{open.ref || "—"}</span>
            </div>
            {open.note && (
              <div className="adm-noteblock" style={{ marginTop: 10 }}>
                {open.note}
              </div>
            )}
          </div>

          <div className="adm-panelsec">
            <div className="adm-seclabel">Timeline</div>
            <div className="adm-timeline">
              <div className="adm-tlrow">
                <span className="adm-tldot" style={{ background: "#C9C2B4" }} />
                <span>
                  <span className="adm-tllabel">Added to pipeline</span>
                  <span className="adm-tltime" style={{ display: "block" }}>
                    {fmtDate(open.createdAt)}
                  </span>
                </span>
              </div>
              {openBooking && (
                <div className="adm-tlrow">
                  <span className="adm-tldot" style={{ background: "#F5DC72" }} />
                  <span>
                    <span className="adm-tllabel">Walkthrough booked</span>
                    <span className="adm-tltime" style={{ display: "block" }}>
                      <LocalTime iso={openBooking.startsAt.toISOString()} />
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}

      {creating && (
        <Panel title="Add a lead" closeHref={listHref}>
          <form action={addLead}>
            <div className="adm-panelsec">
              <div className="adm-field" style={{ marginTop: 0 }}>
                <label htmlFor="new-name">Name</label>
                <input id="new-name" name="name" placeholder="Jordan Alvarez" />
              </div>
              <div className="adm-field">
                <label htmlFor="new-email">Email (required)</label>
                <input id="new-email" name="email" type="email" required />
              </div>
              <div className="adm-fieldrow2">
                <div>
                  <label htmlFor="new-state">State</label>
                  <select id="new-state" name="state" defaultValue="">
                    <option value="">—</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="new-source">Source</label>
                  <select id="new-source" name="source_display" disabled defaultValue="manual">
                    <option value="manual">Manual</option>
                  </select>
                </div>
              </div>
              <div className="adm-field">
                <label htmlFor="new-note">Note</label>
                <textarea id="new-note" name="note" rows={4} placeholder="Met at the homeschool conference…" />
              </div>
              <div className="adm-noteblock" style={{ marginTop: 14 }}>
                Leads added by hand are marked <span className="mono">manual</span>. The
                walkthrough button writes its own.
              </div>
            </div>
            <div className="adm-panelfoot" style={{ borderTop: "none", paddingTop: 0 }}>
              <div className="adm-footgrid">
                <Link className="adm-footbtn adm-footbtn-ghost" href={listHref}>
                  Cancel
                </Link>
                <button className="adm-footbtn adm-footbtn-accent">Add lead</button>
              </div>
            </div>
          </form>
        </Panel>
      )}
    </>
  );
}
