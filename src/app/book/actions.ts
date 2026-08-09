"use server";

// Public: book a walkthrough. This is the walkthrough button's destination
// and the admin console's lead source — a booking IS a lead, born scheduled.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prismaSystem } from "@/lib/db";
import { sendEmail, looksLikeEmail } from "@/lib/email";
import { expandRules } from "@/lib/availability";
import { US_STATE_SET } from "@/lib/us-states";

export async function bookWalkthrough(formData: FormData) {
  const startsAtIso = String(formData.get("startsAt") || "");
  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const stateRaw = String(formData.get("state") || "");
  const state = US_STATE_SET.has(stateRaw) || stateRaw === "Other" ? stateRaw : "";
  if (
    !startsAtIso ||
    Number.isNaN(Date.parse(startsAtIso)) ||
    !name ||
    !state ||
    !looksLikeEmail(email)
  ) {
    redirect("/book?error=form");
  }

  // The picked time must be one the rules would offer RIGHT NOW — recomputed
  // server-side, booked times subtracted. Anything else (stale page, crafted
  // POST, 3am on a Sunday) is simply not on the menu.
  const [rules, booked] = await Promise.all([
    prismaSystem.availabilityRule.findMany({ orderBy: { createdAt: "asc" } }),
    prismaSystem.walkthroughSlot.findMany({
      where: { startsAt: { gt: new Date() } },
      select: { startsAt: true },
    }),
  ]);
  const open = expandRules(rules, new Date(), new Set(booked.map((b) => b.startsAt.getTime())));
  const picked = open.find((s) => s.startsAt.getTime() === Date.parse(startsAtIso));
  if (!picked) redirect("/book?error=taken");

  // Campaign attribution: the coh_ref cookie is set by the proxy when the
  // visitor first arrived with ?ref= / ?utm_source=, and surfaces in the
  // admin Marketing tab. Absent is fine — most leads have no campaign.
  const jar = await cookies();
  const ref = (jar.get("coh_ref")?.value ?? "").slice(0, 60);

  // prismaSystem: platform tables — a prospect has no tenant.
  //
  // Race safety lives in the database now: WalkthroughSlot.startsAt is
  // UNIQUE, so two people booking the same generated time both INSERT and
  // exactly one succeeds. The loser's lead row is deleted and they repick.
  const lead = await prismaSystem.lead.create({
    data: { name, email, state, source: "walkthrough", status: "scheduled", ref },
  });
  try {
    await prismaSystem.walkthroughSlot.create({
      data: { startsAt: picked.startsAt, durationMin: picked.durationMin, leadId: lead.id },
    });
  } catch (e) {
    await prismaSystem.lead.delete({ where: { id: lead.id } });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      redirect("/book?error=taken");
    }
    throw e;
  }

  const when = picked.startsAt.toISOString();

  // Confirmation to the prospect. The UTC spell-out is deliberate: we do not
  // know their timezone server-side, and a wrong local time on a calendar
  // invite is worse than an honest universal one. The page already showed
  // them their local time; this is the record.
  await sendEmail({
    to: email,
    subject: "Your Cohort walkthrough is booked",
    text: [
      `Hi ${name},`,
      ``,
      `You're booked for a ${picked.durationMin}-minute walkthrough of Cohort.`,
      ``,
      `When: ${when} (UTC) — the time you picked, shown in your local time on the page.`,
      ``,
      `You'll get a reply from the founder with the meeting link. Need to`,
      `reschedule? Just reply to this email.`,
      ``,
      `— Cohort. Run the school. Get paid for it.`,
    ].join("\n"),
  });

  // Heads-up to the operator, through the forward address so it lands in the
  // same inbox as replies. Best-effort like every send.
  const operator = process.env.EMAIL_FORWARD_TO;
  if (operator) {
    await sendEmail({
      to: operator,
      subject: `Walkthrough booked: ${name} (${state})`,
      text: `${name} <${email}> in ${state} booked ${when} (UTC).\n\nLead is in /cohort-admin/leads, booking in /cohort-admin/walkthroughs. Send them a meeting link.`,
    });
  }

  redirect("/book?booked=1");
}
