"use server";

// Public: create a new school + its owner account, and sign in. This is what
// makes the deployment multi-tenant at the application layer — every query is
// already scoped by schoolId. (Database-level row-level security is a separate
// step that requires the Postgres migration; see roadmap 6.2.)

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma, prismaSystem } from "@/lib/db";
import { enterTenant } from "@/lib/tenant-context";
import { availableSlug, isUsableSlug, slugify } from "@/lib/tenant";
import { originFor } from "@/lib/tenant-server";
import { newTokenValue, tokenExpiryMinutes } from "@/lib/tokens";
import { hashPassword, newSessionId } from "@/lib/password";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, logAudit } from "@/lib/auth";

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
  // No duplicate check on the address any more. Signup CREATES a school, so
  // the new owner account is the first in an empty tenant and cannot collide
  // with anything — and a founder who already runs one microschool starting a
  // second is a real case this used to block outright.

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

  const school = await prismaSystem.school.create({
    data: { name: schoolName, slug, state, esaAmount, address: "" },
  });
  // The tenant exists now; everything else in this signup belongs to it.
  enterTenant(school.id);
  const owner = await prisma.user.create({
    data: { schoolId: school.id, role: "owner", name, email, password: hashPassword(password) },
  });

  await logAudit(owner.id, "school_created", `${schoolName} (${state})`);

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
  const origin = originFor(slug);
  if (origin) {
    const handoff = newTokenValue();
    await prisma.token.create({
      data: {
        token: handoff,
        type: "signin_handoff",
        schoolId: school.id,
        userId: owner.id,
        expiresAt: tokenExpiryMinutes(2),
      },
    });
    redirect(`${origin}/enter?t=${encodeURIComponent(handoff)}`);
  }

  // Untenanted deployment: one origin, so sign in here.
  const sid = newSessionId();
  await prisma.session.create({ data: { id: sid, userId: owner.id } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sid, SESSION_COOKIE_OPTIONS);
  redirect("/dashboard");
}
