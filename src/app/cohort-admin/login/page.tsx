// /cohort-admin/login — the console's own door, so the console works on the
// apex (schoolcohort.com/cohort-admin) where no school session exists.
// Deliberately ungated; everything behind it still passes requirePlatformAdmin.

import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdmNotice } from "../ui";
import { adminLogin } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign in — Cohort" };

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session?.user.platformAdmin && !session.actor) redirect("/cohort-admin");

  const { error } = await searchParams;

  return (
    <div className="adm-auth">
      <div className="adm-authlockup">
        <span className="adm-authmark">
          <Image src="/logo-mark.png" alt="" width={26} height={33} />
        </span>
        <span>
          <span className="adm-authname">Cohort</span>
          <span className="adm-authrole">Operator console</span>
        </span>
      </div>

      <h1>Admin sign in</h1>

      {error && (
        <div style={{ width: "100%" }}>
          <AdmNotice tone="bad">That didn&apos;t work.</AdmNotice>
        </div>
      )}

      <form action={adminLogin} className="adm-authcard">
        <div className="adm-field" style={{ marginTop: 0 }}>
          <label htmlFor="admin-email">Email</label>
          <input id="admin-email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="adm-field">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        <button className="adm-btn" style={{ marginTop: 16, width: "100%", padding: 12 }}>
          Sign in
        </button>
      </form>
      <p className="adm-authfoot">
        Operator accounts are granted by hand. If this page refuses you, the flag hasn&apos;t
        been set for your account.
      </p>
    </div>
  );
}
