// Building a school: the one place a tenant comes into existence.
//
// Two callers share this. The signup action calls it directly when Stripe
// isn't configured (local dev, previews, the smoke test). When the paywall
// is live, signup only records a SignupIntent — and fulfillSignupIntent()
// builds the school AFTER Stripe confirms checkout, invoked by whichever
// arrives first: the success redirect or the webhook. The consumedAt stamp
// makes that race safe: exactly one caller wins the UPDATE, the other just
// reads the result.

import { prismaSystem } from "@/lib/db";
import { availableSlug } from "@/lib/tenant";
import { originFor } from "@/lib/tenant-server";
import { logAudit } from "@/lib/auth";
import { sendEmail, appUrl } from "@/lib/email";
import type { SchoolKind } from "@/lib/kind";

export type ProvisionInput = {
  /** "school" (default) or "family" — see lib/kind.ts. */
  kind?: SchoolKind;
  schoolName: string;
  slug: string;
  state: string;
  esaAmount: number;
  ownerName: string;
  email: string;
  passwordHash: string; // ALWAYS pre-hashed — raw passwords never travel here
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

export type Provisioned = {
  schoolId: string;
  ownerId: string;
  slug: string;
};

export async function provisionSchool(input: ProvisionInput): Promise<Provisioned> {
  // prismaSystem: signup builds a brand-new tenant from nothing; these
  // creates precede any session or request tenant.
  const kind: SchoolKind = input.kind ?? "school";
  const school = await prismaSystem.school.create({
    data: {
      kind,
      name: input.schoolName,
      slug: input.slug,
      state: input.state,
      esaAmount: input.esaAmount,
      address: "",
      // A family's records back ESA claims that can be audited years later,
      // so the default retention window is five school years rather than
      // two. Still the family's to change in Settings.
      ...(kind === "family" ? { retentionDays: 1825 } : {}),
      stripeCustomerId: input.stripeCustomerId ?? "",
      stripeSubscriptionId: input.stripeSubscriptionId ?? "",
      subscriptionStatus: input.stripeSubscriptionId ? "active" : "",
    },
  });
  const owner = await prismaSystem.user.create({
    data: {
      schoolId: school.id,
      role: "owner",
      name: input.ownerName,
      email: input.email,
      password: input.passwordHash,
    },
  });

  await logAudit(owner.id, "school_created", `${input.schoolName} (${input.state}, ${kind})`);

  // The welcome email: transactional, and mostly a delivery vehicle for the
  // one fact worth keeping — the school's permanent address. Best-effort by
  // design: sendEmail never throws and fails closed when unconfigured, so a
  // mail outage can never break signup itself.
  const schoolOrigin = originFor(input.slug);
  const steps =
    kind === "family"
      ? [
          `That address is permanent — it's where you and your kids sign in,`,
          `so bookmark it.`,
          ``,
          `Good first steps, in order:`,
          `  1. Add your children (Children -> Add).`,
          `  2. Set your instructional days (Calendar).`,
          `  3. Log attendance and observations as you go — they're the`,
          `     evidence behind every claim.`,
          `  4. The next time you buy something with ESA funds, open ESA claims,`,
          `     attach the receipt, print the packet, and upload it to your`,
          `     state portal.`,
        ]
      : [
          `That address is permanent — it's where you and your families sign in,`,
          `so bookmark it and use it in your invitations.`,
          ``,
          `Good first steps, in order:`,
          `  1. Add your students (Students -> Add, or import a CSV).`,
          `  2. Publish your term dates (Calendar) — they set the instructional-day`,
          `     count every ESA invoice claims.`,
          `  3. Take attendance. It's the single biggest input to getting paid.`,
        ];
  await sendEmail({
    to: input.email,
    subject: `Welcome to Cohort — ${input.schoolName} is set up`,
    text: [
      `${input.schoolName} now has its own home on Cohort:`,
      ``,
      `  ${schoolOrigin || appUrl()}`,
      ``,
      ...steps,
      ``,
      `Reply to this email and it reaches the founder.`,
      ``,
      `— Cohort. Run the school. Get paid for it.`,
    ].join("\n"),
  });

  return { schoolId: school.id, ownerId: owner.id, slug: input.slug };
}

/**
 * Turn a paid SignupIntent into a school, exactly once.
 *
 * Returns the provisioned identifiers whether THIS call did the work or a
 * concurrent one already had (redirect and webhook can race). Returns null
 * only if the intent doesn't exist.
 */
export async function fulfillSignupIntent(
  intentId: string,
  billing: { customerId: string; subscriptionId: string },
): Promise<Provisioned | null> {
  // Claim it. One winner; losers see count 0 and read the winner's result.
  const claimed = await prismaSystem.signupIntent.updateMany({
    where: { id: intentId, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const intent = await prismaSystem.signupIntent.findUnique({ where: { id: intentId } });
  if (!intent) return null;

  if (claimed.count === 0) {
    // Already fulfilled (or mid-fulfillment). Wait briefly for the winner to
    // record the school — the redirect handler needs it for the handoff.
    for (let i = 0; i < 20 && !intent.schoolId; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const again = await prismaSystem.signupIntent.findUnique({ where: { id: intentId } });
      if (again?.schoolId) {
        const owner = await prismaSystem.user.findFirst({
          where: { schoolId: again.schoolId, role: "owner" },
          select: { id: true },
        });
        const school = await prismaSystem.school.findUnique({
          where: { id: again.schoolId },
          select: { slug: true },
        });
        if (owner && school) return { schoolId: again.schoolId, ownerId: owner.id, slug: school.slug };
      }
    }
    if (intent.schoolId) {
      const owner = await prismaSystem.user.findFirst({
        where: { schoolId: intent.schoolId, role: "owner" },
        select: { id: true },
      });
      const school = await prismaSystem.school.findUnique({
        where: { id: intent.schoolId },
        select: { slug: true },
      });
      if (owner && school) return { schoolId: intent.schoolId, ownerId: owner.id, slug: school.slug };
    }
    return null;
  }

  // The slug was free at intent time; someone may have taken it while this
  // founder was typing a card number. They have PAID — never fail them over
  // a name. Nudge to the nearest available variant instead.
  let slug = intent.slug;
  const taken = (await prismaSystem.school.findMany({ select: { slug: true } })).map((s) => s.slug);
  if (taken.includes(slug)) {
    slug = availableSlug(intent.schoolName, taken) ?? `${slug}-${Date.now().toString(36)}`;
  }

  const provisioned = await provisionSchool({
    kind: intent.kind === "family" ? "family" : "school",
    schoolName: intent.schoolName,
    slug,
    state: intent.state,
    esaAmount: intent.esaAmount,
    ownerName: intent.ownerName,
    email: intent.email,
    passwordHash: intent.passwordHash,
    stripeCustomerId: billing.customerId,
    stripeSubscriptionId: billing.subscriptionId,
  });

  await prismaSystem.signupIntent.update({
    where: { id: intentId },
    data: { schoolId: provisioned.schoolId },
  });

  return provisioned;
}
