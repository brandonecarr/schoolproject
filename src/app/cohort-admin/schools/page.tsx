// /cohort-admin/schools — every school on the platform, one row each, with
// a right-hand detail panel instead of a separate page. The panel is
// URL-backed (?school=<id>) so refresh and server-action redirects land back
// on the open record.
//
// prismaSystem throughout: cross-school reads are this console's whole job.
// Aggregates and school-level rows only — no student names, no child work.

import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { Monogram, AdmPill, Panel, EmptyState, fmtDate, fmtMonthYear } from "../ui";
import { IconDoc, IconMail, IconChat, IconSend } from "../icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Schools — Cohort Admin" };

const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting reimbursement",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
};

export default async function AdminSchools({
  searchParams,
}: {
  searchParams: Promise<{ school?: string }>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;

  const [schools, students, users, parents, invoiceSums] = await Promise.all([
    prismaSystem.school.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, slug: true, state: true, createdAt: true, providerRail: true },
    }),
    prismaSystem.student.groupBy({ by: ["schoolId"], _count: true }),
    prismaSystem.user.groupBy({ by: ["schoolId"], _count: true }),
    prismaSystem.user.groupBy({ by: ["schoolId"], where: { role: "parent" }, _count: true }),
    prismaSystem.invoice.groupBy({
      by: ["schoolId", "status"],
      _sum: { amount: true },
    }),
  ]);

  const studentCount = new Map(students.map((s) => [s.schoolId, s._count]));
  const userCount = new Map(users.map((u) => [u.schoolId, u._count]));
  const parentCount = new Map(parents.map((p) => [p.schoolId, p._count]));
  const paidBySchool = new Map<string, number>();
  for (const i of invoiceSums) {
    if (i.status === "paid") {
      paidBySchool.set(i.schoolId, (paidBySchool.get(i.schoolId) ?? 0) + (i._sum.amount ?? 0));
    }
  }

  const open = sp.school ? (schools.find((s) => s.id === sp.school) ?? null) : null;
  const openIndex = open ? schools.findIndex((s) => s.id === open.id) : 0;

  // Panel-only reads: the open school's recent invoices and its owner, for
  // the one real contact action the footer offers.
  const [openInvoices, openOwner] = open
    ? await Promise.all([
        prismaSystem.invoice.findMany({
          where: { schoolId: open.id },
          orderBy: { periodStart: "desc" },
          take: 6,
          select: { id: true, periodStart: true, status: true, amount: true },
        }),
        prismaSystem.user.findFirst({
          where: { schoolId: open.id, role: "owner" },
          select: { email: true },
        }),
      ])
    : [null, null];

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
                s.id === open?.id ? "adm-trow adm-cols-schools adm-trow-active" : "adm-trow adm-cols-schools";
              return (
                <Link key={s.id} className={rowCls} href={`/cohort-admin/schools?school=${s.id}`}>
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
                  <div className="adm-cellnum">{studentCount.get(s.id) ?? 0}</div>
                  <div className="adm-cellnum">{userCount.get(s.id) ?? 0}</div>
                  <div className="adm-cellnum adm-cellnum-strong">
                    ${(paidBySchool.get(s.id) ?? 0).toLocaleString()}
                  </div>
                  <div className="adm-cellnum" style={{ color: "var(--a-muted-soft)", fontSize: 12.5 }}>
                    {fmtDate(s.createdAt)}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {open && (
        <Panel
          title={open.name}
          closeHref="/cohort-admin/schools"
          meta={
            <>
              <AdmPill tone="info" square>
                {open.state}
              </AdmPill>
              <span>Joined {fmtDate(open.createdAt)}</span>
            </>
          }
          footer={
            <>
              <div className="adm-foottotal">
                Reimbursed, all time
                <span className="v">${(paidBySchool.get(open.id) ?? 0).toLocaleString()}</span>
              </div>
              <div className="adm-footgrid">
                <a
                  className="adm-footbtn"
                  href={openOwner ? `mailto:${openOwner.email}` : "mailto:"}
                >
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
                href={openOwner ? `mailto:${openOwner.email}` : "mailto:"}
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
            <div className="adm-seclabel">Enrollment</div>
            <div className="adm-stats3">
              <div className="adm-stattile">
                <div className="n">{studentCount.get(open.id) ?? 0}</div>
                <div className="l">Students</div>
              </div>
              <div className="adm-stattile">
                <div className="n">{userCount.get(open.id) ?? 0}</div>
                <div className="l">Accounts</div>
              </div>
              <div className="adm-stattile">
                <div className="n">{parentCount.get(open.id) ?? 0}</div>
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
            {!openInvoices || openInvoices.length === 0 ? (
              <p className="adm-cardsub">No invoices yet.</p>
            ) : (
              openInvoices.map((inv) => (
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
