import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { currentHostKind } from "@/lib/tenant-server";
import { rootDomain } from "@/lib/tenant-config";

// "/" means two different things depending on the address it arrives on.
//
// On a school's own subdomain, and on any untenanted deployment, it is what it
// has always been: send each role to their home. On the apex it is the public
// front of the product, because there is no school there to send anyone to.
//
// The apex half is a placeholder. The real landing page is 9.5; what it needs
// to do TODAY is not be a redirect loop — the proxy sends /login on the apex
// here, and if this bounced back to /login the two would ping-pong.
export const dynamic = "force-dynamic";

export default async function Home() {
  const kind = await currentHostKind();

  if (kind.kind !== "apex") {
    const session = await getSession();
    if (!session) redirect("/login");
    if (session.user.role === "parent") redirect("/parent/feed");
    if (session.user.role === "student") redirect("/student");
    redirect("/dashboard");
  }

  const root = rootDomain();
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div className="row" style={{ gap: 10, marginBottom: 20 }}>
          <div className="brand-mark">C</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600 }}>Cohort</div>
        </div>
        <h1 style={{ marginBottom: 6 }}>The system that gets a microschool paid</h1>
        <p className="muted" style={{ margin: "0 0 22px" }}>
          Attendance, evidence, and reimbursement paperwork that a state reviewer will accept —
          correctly, on time, in any state.
        </p>

        <div className="card">
          <div className="eyebrow">Already have a school here?</div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            Every school signs in at its own address, not this one. Cedar Grove Learning Collective
            signs in at <span className="mono">cedar-grove.{root}</span>. Yours is in the invitation
            your school sent you.
          </p>
        </div>

        <Link className="btn" href="/signup" style={{ width: "100%", marginTop: 16 }}>
          Start a school on Cohort
        </Link>
      </div>
    </div>
  );
}
