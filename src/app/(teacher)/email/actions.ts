"use server";

// Send an email blast — a teacher-designed announcement delivered to parents'
// inboxes, because "it's on the dashboard" only reaches families who sign in.
//
// The action re-validates everything the builder claims: blocks re-parse
// against the schema (a crafted payload degrades, never injects), the
// audience is resolved here from the database rather than trusted from the
// form, and only parents who have left email alerts ON are addressed. The
// blast is logged whatever the delivery counts say — history should show what
// was sent, not what succeeded.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSchoolTeacher, logAudit } from "@/lib/auth";
import { sendEmail, emailConfigured, looksLikeEmail, appUrl } from "@/lib/email";
import { parseBlocks, blocksToHtml, blocksToText } from "@/lib/email-blocks";
import { accentOf } from "@/lib/branding";
import { originFor } from "@/lib/tenant-server";
import { newTokenValue } from "@/lib/tokens";

const BLAST_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const BLAST_IMAGE_MAX = 4 * 1024 * 1024;

/**
 * Upload an image for the builder. Called directly from the client (not as a
 * form action), so it RETURNS rather than redirects: the absolute URL the
 * image block should carry, or an error message to show inline.
 *
 * The URL must be absolute and publicly fetchable — it ends up in an <img>
 * tag inside a parent's inbox, where relative paths and session cookies mean
 * nothing. Hence the publicToken (see /blast-img/[token]).
 */
export async function uploadBlastImage(
  formData: FormData
): Promise<{ url: string } | { error: string }> {
  const { user, school } = await requireSchoolTeacher();
  const schoolId = school!.id;

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "No file arrived — try again." };
  const ext = BLAST_IMAGE_TYPES[file.type];
  if (!ext) return { error: "Use a PNG, JPEG, WebP or GIF image." };
  if (file.size > BLAST_IMAGE_MAX) return { error: "Keep images under 4 MB." };

  const buf = Buffer.from(await file.arrayBuffer());
  const publicToken = newTokenValue();
  await prisma.fileRec.create({
    data: {
      schoolId,
      // Null: builder artwork is school comms material, not a record about a
      // child — same footing as the school logo.
      studentId: null,
      label: file.name.replace(/\.[^.]*$/, "").slice(0, 80) || "Blast image",
      ext,
      mime: file.type,
      bytes: buf.length,
      data: buf,
      publicToken,
      capturedAt: new Date().toISOString(),
    },
  });
  await logAudit(user.id, "blast_image_uploaded", `${buf.length} bytes`);

  const base = originFor(school!.slug) || appUrl();
  return { url: `${base}/blast-img/${publicToken}` };
}

/**
 * Save (or update) a draft. Called directly from the client so the builder
 * keeps its state — no redirect, just the row id back so the next save
 * updates the same draft instead of multiplying copies.
 *
 * A draft's audience column stores the actual selection
 * ("all" | "students:<id,id>"), so resuming restores who it was aimed at.
 */
export async function saveBlastDraft(input: {
  id?: string;
  subject: string;
  blocksJson: string;
  audience: string;
}): Promise<{ id: string } | { error: string }> {
  const { user, school } = await requireSchoolTeacher();
  const schoolId = school!.id;

  const subject = String(input.subject || "").trim().slice(0, 160);
  const blocks = parseBlocks(String(input.blocksJson || ""));
  if (!subject && blocks.length === 0) return { error: "Nothing to save yet." };
  const audience = /^(all|students:[\w,-]*)$/.test(String(input.audience)) ? input.audience : "all";

  const data = { subject, blocksJson: JSON.stringify(blocks), audience };
  if (input.id) {
    // Only a DRAFT may be overwritten — a sent row is history and immutable.
    const updated = await prisma.schoolBlast.updateMany({
      where: { id: input.id, schoolId, sentAt: null },
      data,
    });
    if (updated.count > 0) return { id: input.id };
  }
  const row = await prisma.schoolBlast.create({
    data: { ...data, schoolId, senderId: user.id, sentCount: 0 },
  });
  return { id: row.id };
}

export async function deleteBlastDraft(id: string): Promise<{ ok: boolean }> {
  const { school } = await requireSchoolTeacher();
  // sentAt null in the filter: this can only ever remove a draft, never a
  // row from the send log.
  const del = await prisma.schoolBlast.deleteMany({
    where: { id, schoolId: school!.id, sentAt: null },
  });
  return { ok: del.count > 0 };
}

/**
 * Send the current design to ONE address the teacher typed — themselves,
 * usually — so they can see it in a real inbox before it goes to families.
 * Deliberately outside the audience machinery: no emailAlerts filter, no
 * confirmation checkbox, no history row. The subject is prefixed so a test
 * can never be mistaken for the real thing.
 */
export async function sendTestBlast(input: {
  to: string;
  subject: string;
  blocksJson: string;
}): Promise<{ sent: true } | { error: string }> {
  const { user, school } = await requireSchoolTeacher();

  if (!emailConfigured())
    return { error: "Email delivery isn't configured on this deployment." };
  const to = String(input.to || "").trim().toLowerCase();
  if (!looksLikeEmail(to)) return { error: "That doesn't look like an email address." };
  const blocks = parseBlocks(String(input.blocksJson || ""));
  if (blocks.length === 0) return { error: "Add at least one block first." };

  const subject = String(input.subject || "").trim().slice(0, 150) || "Untitled blast";
  const brand = { schoolName: school!.name, accentColor: accentOf(school) };
  const r = await sendEmail({
    to,
    subject: `[Test] ${subject}`,
    text: blocksToText(blocks, brand),
    html: blocksToHtml(blocks, brand),
  });
  if (!r.sent) return { error: "The email provider refused the send — try again shortly." };
  await logAudit(user.id, "blast_test_sent", to);
  return { sent: true };
}

export async function sendSchoolBlast(formData: FormData) {
  const { user, school } = await requireSchoolTeacher();
  const schoolId = school!.id;

  const subject = String(formData.get("subject") || "").trim().slice(0, 160);
  const blocks = parseBlocks(String(formData.get("blocks") || ""));
  const audience = String(formData.get("audience") || "all");
  const studentIds = formData.getAll("students").map(String);
  const draftId = String(formData.get("draftId") || "");

  if (!subject) redirect("/email?error=subject");
  if (blocks.length === 0) redirect("/email?error=blocks");
  // The armed checkbox: sending email to every family is not a thing to do by
  // accidentally hitting Enter in the subject field.
  if (formData.get("confirm") !== "on") redirect("/email?error=confirm");
  if (!emailConfigured()) redirect("/email?error=email");

  // Resolve the audience HERE. The form's recipient count is a preview; the
  // database decides who actually gets mail.
  const parents = await prisma.user.findMany({
    where: { schoolId, role: "parent", emailAlerts: true },
    select: { email: true, studentIdsJson: true },
  });
  const wanted = new Set(studentIds);
  const inAudience = (p: { studentIdsJson: string | null }) => {
    if (audience !== "students") return true;
    try {
      const ids: string[] = p.studentIdsJson ? JSON.parse(p.studentIdsJson) : [];
      return ids.some((id) => wanted.has(id));
    } catch {
      return false;
    }
  };
  const recipients = [
    ...new Set(
      parents
        .filter((p) => inAudience(p) && looksLikeEmail(p.email))
        .map((p) => p.email.toLowerCase())
    ),
  ];
  if (recipients.length === 0) redirect("/email?error=recipients");

  const brand = { schoolName: school!.name, accentColor: accentOf(school) };
  const html = blocksToHtml(blocks, brand);
  const text = blocksToText(blocks, brand);

  // Sequential, like every other send in the app: a microschool addresses a
  // handful of families, and one address at a time keeps a single bad
  // recipient from taking the rest down with it.
  let sent = 0;
  for (const to of recipients) {
    const r = await sendEmail({ to, subject, text, html });
    if (r.sent) sent++;
  }

  // If this design came from a draft, that row BECOMES the history entry —
  // otherwise the send log would show the blast and a stale twin of it.
  const record = {
    senderId: user.id,
    subject,
    blocksJson: JSON.stringify(blocks),
    audience: audience === "students" ? `students:${wanted.size}` : "all",
    sentCount: sent,
    sentAt: new Date(),
  };
  const converted = draftId
    ? await prisma.schoolBlast.updateMany({
        where: { id: draftId, schoolId, sentAt: null },
        data: record,
      })
    : { count: 0 };
  if (converted.count === 0) {
    await prisma.schoolBlast.create({ data: { schoolId, ...record } });
  }
  await logAudit(user.id, "email_blast_sent", subject);

  redirect(`/email?sent=${sent}&of=${recipients.length}`);
}
