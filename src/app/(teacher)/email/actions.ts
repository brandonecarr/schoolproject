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
import { sendEmail, emailConfigured, looksLikeEmail } from "@/lib/email";
import { parseBlocks, blocksToHtml, blocksToText } from "@/lib/email-blocks";
import { accentOf } from "@/lib/branding";

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
