// /cohort-admin/login — the console's own door, so the console works on the
// apex (schoolcohort.com/cohort-admin) where no school session exists.
// Deliberately ungated; everything behind it still passes requirePlatformAdmin.

import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Notice } from "@/components/ui";
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
    <div className="authplain">
      <main className="authcol">
        <div className="lockup">
          <Image src="/logo-mark.png" alt="" width={30} height={39} className="brand-markimg" />
          <div>
            <div className="wordmark">Cohort</div>
            <div className="tagline">Operator console</div>
          </div>
        </div>

        <h1>Admin sign in</h1>

        {error && <Notice tone="bad">That didn&apos;t work.</Notice>}

        <form action={adminLogin} className="card2 authcard">
          <label htmlFor="admin-email">Email</label>
          <input id="admin-email" name="email" type="email" required autoComplete="email" />
          <label htmlFor="admin-password" style={{ marginTop: 12 }}>
            Password
          </label>
          <input
            id="admin-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
          <button className="btn" style={{ marginTop: 14, width: "100%" }}>
            Sign in
          </button>
        </form>
        <p className="small muted" style={{ marginTop: 14 }}>
          Operator accounts are granted by hand. If this page refuses you, the flag hasn&apos;t
          been set for your account.
        </p>
      </main>
    </div>
  );
}
