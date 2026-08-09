// /cohort-admin/operators — who can open this console. The platform-admin
// flag is granted by the create-operator script and by nothing else; this
// screen makes that visible rather than pretending there's a role system.
// The capability matrix is the SPEC for the role model if one ever lands —
// today only the Admin column is real.
//
// Deliberately no "grant access" button: the whole security story of this
// console is that no UI can create or escalate an operator.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { prismaSystem } from "@/lib/db";
import { Monogram, AdmPill, fmtDate } from "../ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operators — Cohort Admin" };

const MATRIX: { capability: string; cols: [boolean, boolean, boolean] }[] = [
  { capability: "See every school and its totals", cols: [true, true, true] },
  { capability: "Open a school as its owner", cols: [true, true, false] },
  { capability: "Edit leads and pipeline status", cols: [true, true, false] },
  { capability: "Set walkthrough availability", cols: [true, true, false] },
  { capability: "Send an email blast", cols: [true, false, false] },
  { capability: "Grant or revoke operator access", cols: [true, false, false] },
  { capability: "Purge a school's data", cols: [true, false, false] },
];

export default async function AdminOperators() {
  await requirePlatformAdmin();

  // prismaSystem: reading who holds the flag — the same filter the login
  // door uses. Nothing on this page writes it.
  const operators = await prismaSystem.user.findMany({
    where: { platformAdmin: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, createdAt: true },
  });

  return (
    <div className="adm-screen">
      <div className="adm-eyebrow">Access</div>
      <h1>Operators</h1>
      <p className="adm-intro">
        The platform-admin flag is granted by hand and no UI can set it — not even this one.
        Everything behind the console re-checks it on every request.
      </p>

      <div className="adm-table">
        <div className="adm-thead adm-cols-operators">
          <div>Account</div>
          <div>Role</div>
          <div className="adm-cellr">Added</div>
        </div>
        {operators.map((o, i) => (
          <div key={o.id} className="adm-trow adm-cols-operators" style={{ cursor: "default" }}>
            <div className="adm-recid">
              <Monogram name={o.name || o.email} index={i} round />
              <span style={{ minWidth: 0 }}>
                <span className="adm-listname">{o.name || "—"}</span>
                <span className="adm-listsub">{o.email}</span>
              </span>
            </div>
            <div>
              <AdmPill tone="warn">Platform admin</AdmPill>
            </div>
            <div className="adm-cellnum" style={{ color: "var(--a-muted-soft)", fontSize: 12.5 }}>
              {fmtDate(o.createdAt)}
            </div>
          </div>
        ))}
      </div>

      <div className="adm-card" style={{ marginTop: 12 }}>
        <div className="adm-cardtitle">Granting access</div>
        <p className="adm-cardsub" style={{ marginTop: 6, maxWidth: 620, lineHeight: 1.6 }}>
          New operators come from the grant script, run by someone with database access — that
          is the design, not a gap. From the repo:
        </p>
        <div className="adm-noteblock mono" style={{ marginTop: 10, fontSize: 12.5 }}>
          node scripts/create-operator.mjs you@schoolcohort.com &apos;a strong password&apos;
        </div>
      </div>

      <div className="adm-card" style={{ marginTop: 12 }}>
        <div className="adm-cardtitle">What each role can reach</div>
        <p className="adm-cardsub">
          Today every operator is Admin. Support and Read-only are the spec for the role model
          if one lands.
        </p>
        <div className="adm-matrix">
          <div className="adm-matrixhead">Capability</div>
          <div className="adm-matrixhead adm-matrixcell">Admin</div>
          <div className="adm-matrixhead adm-matrixcell">Support</div>
          <div className="adm-matrixhead adm-matrixcell">Read-only</div>
          {MATRIX.map((row) => (
            <div key={row.capability} style={{ display: "contents" }}>
              <div>{row.capability}</div>
              {row.cols.map((yes, i) => (
                <div key={i} className={yes ? "adm-matrixcell adm-matrixyes" : "adm-matrixcell adm-matrixno"}>
                  {yes ? "Yes" : "—"}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
