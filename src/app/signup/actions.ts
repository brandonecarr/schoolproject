"use server";

// Public: start a new school. With Stripe configured this is a PAYWALL —
// nothing is created until checkout completes: the form's details become a
// SignupIntent (password hashed immediately), the founder goes to Stripe,
// and fulfillment happens on the way back (or via webhook, whichever lands
// first). Without Stripe configured — local dev, previews, the smoke test —
// signup provisions directly, exactly as it always did.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prismaSystem } from "@/lib/db";
import { availableSlug, isUsableSlug, slugify } from "@/lib/tenant";
import { originFor } from "@/lib/tenant-server";
import { newTokenValue, tokenExpiryMinutes } from "@/lib/tokens";
import { hashPassword, newSessionId } from "@/lib/password";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { deploymentEnv } from "@/lib/environment";
import { stripeConfigured, createCheckoutSession } from "@/lib/stripe";
import { provisionSchool } from "@/lib/provision";

export async function signup(formData: FormData) {
  const schoolName = String(formData.get("schoolName") || "").trim();
  const state = String(formData.get("state") || "").trim().toUpperCase().slice(0, 2);
  const esaAmount = Number(formData.get("esaAmount")) || 0;
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!schoolName || !state || !name || !email || !password) {
    redirect("/signup?error=1");
  }

  // THE WEB ADDRESS. Whatever the form sent is re-derived here rather than
  // trusted: the field is a client component and could send anything, and a
  // slug becomes a hostname. Empty means the browser ran no JavaScript, and
  // then the school's name is a perfectly good source.
  const asked = slugify(String(formData.get("slug") || ""));
  if (formData.get("slug") && !asked) redirect("/signup?error=slugbad");

  // System: slug uniqueness is global by definition, and creating the school
  // cannot be scoped to a tenant that does not exist yet.
  const taken = (await prismaSystem.school.findMany({ select: { slug: true } })).map((s) => s.slug);
  let slug: string | null;
  if (asked) {
    // Someone typed this one, so it is not ours to quietly renumber into
    // oak-hill-2. Either they get the address they chose or they are told.
    slug = isUsableSlug(asked) && !taken.includes(asked) ? asked : null;
    if (!slug) redirect("/signup?error=slug");
  } else {
    slug = availableSlug(schoolName, taken);
    if (!slug) redirect("/signup?error=slugbad");
  }

  // ---- The paywall ---------------------------------------------------------
  if (stripeConfigured()) {
    // Hash NOW: the raw password's life ends inside this request. The intent
    // row waits with everything fulfillment needs and nothing more.
    const intent = await prismaSystem.signupIntent.create({
      data: {
        schoolName,
        slug,
        state,
        esaAmount,
        ownerName: name,
        email,
        passwordHash: hashPassword(password),
      },
    });

    const base = appUrl();
    const session = await createCheckoutSession({
      intentId: intent.id,
      email,
      successUrl: `${base}/signup/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/signup?canceled=1`,
    });
    await prismaSystem.signupIntent.update({
      where: { id: intent.id },
      data: { stripeSessionId: session.id },
    });
    redirect(session.url);
  }

  // ---- No Stripe configured ------------------------------------------------
  // In PRODUCTION that is a misconfiguration, and the wrong failure mode is
  // the quiet one: silently giving away a free school teaches nobody that
  // billing is down. Refuse loudly instead. Everywhere else — local dev,
  // previews, the smoke test — direct provisioning is the point.
  if (deploymentEnv() === "production") {
    redirect("/signup?error=billing");
  }
  const provisioned = await provisionSchool({
    schoolName,
    slug,
    state,
    esaAmount,
    ownerName: name,
    email,
    passwordHash: hashPassword(password),
  });

  // SIGNING IN ON THE RIGHT HOST.
  //
  // Signup happens on the apex; the school lives on its own subdomain. The
  // session cookie is host-only, so one set here would simply not exist over
  // there — the founder would finish creating a school and immediately be
  // asked to sign in to it.
  //
  // So hand off: a single-use token, good for two minutes, redeemed by /enter
  // on the school's own address, which is where the cookie is set. The token is
  // in a URL and therefore lands in history and any logs along the way, which
  // is exactly why it dies on first use and why two minutes is the whole
  // budget for a redirect the browser follows on its own.
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

  // Untenanted deployment: one origin, so sign in here.
  const sid = newSessionId();
  await prismaSystem.session.create({ data: { id: sid, userId: provisioned.ownerId } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
  redirect("/dashboard");
}
