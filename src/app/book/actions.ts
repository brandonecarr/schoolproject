"use server";

// Public: book a walkthrough. This is the walkthrough button's destination
// and the admin console's lead source — a booking IS a lead, born scheduled.

import { redirect } from "next/navigation";
import { prismaSystem } from "@/lib/db";
import { sendEmail, looksLikeEmail } from "@/lib/email";

export async function bookWalkthrough(formData: FormData) {
  const slotId = String(formData.get("slotId") || "");
  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!slotId || !name || !looksLikeEmail(email)) redirect("/book?error=form");

  // prismaSystem: platform tables — a prospect has no tenant.
  //
  // Claim order matters: create the lead, then claim the slot ATOMICALLY with
  // "WHERE leadId IS NULL". Two people racing for the same slot both reach
  // this line; exactly one updateMany returns count 1. The loser's lead row
  // is deleted and they pick another time.
  const lead = await prismaSystem.lead.create({
    data: { name, email, source: "walkthrough", status: "scheduled" },
  });
  const claimed = await prismaSystem.walkthroughSlot.updateMany({
    where: { id: slotId, leadId: null, startsAt: { gt: new Date() } },
    data: { leadId: lead.id },
  });
  if (claimed.count === 0) {
    await prismaSystem.lead.delete({ where: { id: lead.id } });
    redirect("/book?error=taken");
  }

  const slot = await prismaSystem.walkthroughSlot.findUnique({ where: { id: slotId } });
  const when = slot?.startsAt.toISOString() ?? "";

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
      `You're booked for a ${slot?.durationMin ?? 20}-minute walkthrough of Cohort.`,
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
      subject: `Walkthrough booked: ${name}`,
      text: `${name} <${email}> booked ${when} (UTC).\n\nLead is in /cohort-admin/leads, slot in /cohort-admin/walkthroughs. Send them a meeting link.`,
    });
  }

  redirect("/book?booked=1");
}
