// /signup/complete — where Stripe sends the founder back. The session id in
// the URL proves nothing by itself; the session is fetched from Stripe
// server-side and only a COMPLETED checkout fulfills the intent. Fulfillment
// races the webhook safely (see lib/provision.ts), then the founder is
// handed off to their new school's own address, signed in.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prismaSystem } from "@/lib/db";
import { currentHostKind, originFor } from "@/lib/tenant-server";
import { newTokenValue, tokenExpiryMinutes } from "@/lib/tokens";
import { stripeConfigured, getCheckoutSession } from "@/lib/stripe";
import { fulfillSignupIntent } from "@/lib/provision";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finishing setup — Cohort" };

export default async function SignupComplete({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const kind = await currentHostKind();
  if (kind.kind !== "apex") redirect("/");
  if (!stripeConfigured()) redirect("/signup");

  const { session_id } = await searchParams;
  const failed = (why: string) => (
    <div className="authplain">
      <main className="authcol">
        <div className="lockup">
          <Image src="/logo-mark.png" alt="" width={30} height={39} className="brand-markimg" />
          <div>
            <div className="wordmark">Cohort</div>
            <div className="tagline">Signup</div>
          </div>
        </div>
        <h1>Checkout didn&apos;t finish</h1>
        <div className="notice warn">{why}</div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Nothing was created and nothing recurring is in place unless Stripe shows the
          subscription as active. <Link href="/signup">Start again</Link>, or email{" "}
          <span className="mono">info@schoolcohort.com</span> and a human will sort it out.
        </p>
      </main>
    </div>
  );

  if (!session_id) return failed("The return link is missing its checkout reference.");

  let session;
  try {
    session = await getCheckoutSession(session_id);
  } catch {
    return failed("Stripe didn't recognise this checkout. If you were charged, email us — the receipt has everything we need.");
  }

  if (session.status !== "complete") {
    return failed("The payment step wasn't completed. You can pick up where you left off.");
  }

  const provisioned = await fulfillSignupIntent(session.clientReferenceId, {
    customerId: session.customerId,
    subscriptionId: session.subscriptionId,
  });
  if (!provisioned) {
    return failed(
      "Payment confirmed, but this signup couldn't be matched to its details. Email us and we'll finish setup by hand — you will not be charged twice.",
    );
  }

  // Same handoff as classic signup: single-use, two minutes, redeemed by
  // /enter on the school's own address, which is where the cookie is set.
  const origin = originFor(provisioned.slug);
  if (origin) {
    const handoff = newTokenValue();
    await prismaSystem.token.create({
      data: {
        token: handoff,
        type: "signin_handoff",
        schoolId: provisioned.schoolId,
        userId: provisioned.ownerId,
        expiresAt: tokenExpiryMinutes(2),
      },
    });
    redirect(`${origin}/enter?t=${encodeURIComponent(handoff)}`);
  }
  redirect("/");
}
