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
import { requireTeacher, logAudit } from "@/lib/auth";
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
  const { user, school } = await requireTeacher();
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

export async function sendSchoolBlast(formData: FormData) {
  const { user, school } = await requireTeacher();
  const schoolId = school!.id;

  const subject = String(formData.get("subject") || "").trim().slice(0, 160);
  const blocks = parseBlocks(String(formData.get("blocks") || ""));
  const audience = String(formData.get("audience") || "all");
  const studentIds = formData.getAll("students").map(String);

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

  await prisma.schoolBlast.create({
    data: {
      schoolId,
      senderId: user.id,
      subject,
      blocksJson: JSON.stringify(blocks),
      audience: audience === "students" ? `students:${wanted.size}` : "all",
      sentCount: sent,
    },
  });
  await logAudit(user.id, "email_blast_sent", subject);

  redirect(`/email?sent=${sent}&of=${recipients.length}`);
}
