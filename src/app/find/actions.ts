"use server";

// The school finder: the privacy-preserving answer to a lost sign-in link.
//
// The apex deliberately has no school directory — a public search would let
// anyone enumerate the customer list one letter at a time. So the lookup runs
// the other way: the person tells us their EMAIL, and the answer goes to that
// inbox, never to the screen. Whoever actually belongs to a school gets their
// address back; a stranger probing learns nothing, including whether the email
// exists. The response is identical in every case for that reason.

import { redirect } from "next/navigation";
import { prismaSystem } from "@/lib/db";
import { sendEmail, looksLikeEmail } from "@/lib/email";
import { rootDomain, tenantProtocol, multiTenant } from "@/lib/tenant-config";

export async function findMySchool(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();

  // Everything below is best-effort and silent: the redirect must be the same
  // whether the email matched three schools or none, arrived malformed, or the
  // email provider is down. Any variation is an oracle.
  if (looksLikeEmail(email) && multiTenant()) {
    // prismaSystem: this must see across schools BECAUSE the whole question is
    // "which school does this email belong to" — and the answer is disclosed
    // only to that email's inbox, never to the requester.
    const users = await prismaSystem.user.findMany({
      where: { email },
      select: { schoolId: true },
    });
    const ids = [...new Set(users.map((u) => u.schoolId))];
    const schools = ids.length
      ? (
          await prismaSystem.school.findMany({
            where: { id: { in: ids } },
            select: { name: true, slug: true },
          })
        ).filter((s) => s.slug)
      : [];

    if (schools.length > 0) {
      const origin = (slug: string) => `${tenantProtocol()}://${slug}.${rootDomain()}`;
      const lines = schools.map((s) => `${s.name}\n${origin(s.slug!)}/login`);
      await sendEmail({
        to: email,
        subject: "Your Cohort sign-in address",
        text:
          `You asked for your school's sign-in address on Cohort.\n\n` +
          lines.join("\n\n") +
          `\n\nSign in with this email address and your usual password. ` +
          `If you didn't ask for this, you can ignore it — nothing changed on your account.`,
      });
    }
  }

  redirect("/find?sent=1");
}
