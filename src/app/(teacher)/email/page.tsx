// Email blasts — designed announcements that go to parents' INBOXES.
//
// Announcements post to the dashboards; this is for the families who never
// sign in to see them. The teacher assembles the email from blocks (drag or
// click), watches the real rendered result beside the canvas, picks who gets
// it, and sends. Every send is logged with the exact blocks, so history shows
// what actually left the building.

import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { emailConfigured, looksLikeEmail } from "@/lib/email";
import { accentOf } from "@/lib/branding";
import { Notice } from "@/components/ui";
import { BuilderView, BlastHistory } from "./BuilderView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email blasts — Cohort" };

export default async function EmailBlastPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; of?: string; error?: string }>;
}) {
  const { school } = await requireTeacher();
  const schoolId = school!.id;
  const sp = await searchParams;

  const [students, parents, blasts] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { schoolId, role: "parent" },
      select: { id: true, name: true, email: true, emailAlerts: true, studentIdsJson: true },
      orderBy: { name: "asc" },
    }),
    prisma.schoolBlast.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  // What the client needs to count recipients live — reachability booleans and
  // the parent→children mapping. No email addresses cross into the bundle.
  const parentRows = parents.map((p) => {
    let studentIds: string[] = [];
    try {
      studentIds = p.studentIdsJson ? JSON.parse(p.studentIdsJson) : [];
    } catch {
      /* unparseable = linked to nobody */
    }
    return {
      id: p.id,
      name: p.name,
      reachable: p.emailAlerts && looksLikeEmail(p.email),
      studentIds,
    };
  });
  const optedOut = parentRows.filter((p) => !p.reachable).length;

  const senders = await prisma.user.findMany({
    where: { id: { in: [...new Set(blasts.map((b) => b.senderId))] } },
    select: { id: true, name: true },
  });
  const senderName = new Map(senders.map((s) => [s.id, s.name]));

  const brand = { schoolName: school!.name, accentColor: accentOf(school) };

  const ERRORS: Record<string, string> = {
    subject: "A subject line is required.",
    blocks: "The email is empty — add at least one block.",
    confirm: "Tick the confirmation box to send.",
    email: "Email delivery isn't configured on this deployment, so nothing was sent.",
    recipients: "Nobody matches that audience — no parent with email alerts on.",
  };

  return (
    <>
      <div className="eyebrow">Family</div>
      <h1>Email blasts</h1>
      <p className="small muted" style={{ maxWidth: "72ch" }}>
        A designed email straight to parents&apos; inboxes — for the families who don&apos;t sign
        in to see announcements. Build it from blocks, check the preview, choose who gets it.
      </p>

      {sp.sent && (
        <Notice tone="good">
          Sent to {sp.sent} of {sp.of ?? sp.sent} parent{sp.of === "1" ? "" : "s"}.
        </Notice>
      )}
      {sp.error && <Notice tone="bad">{ERRORS[sp.error] ?? "That didn't work."}</Notice>}
      {!emailConfigured() && (
        <Notice tone="warn">
          Email delivery isn&apos;t configured on this deployment — you can design and preview,
          but sending is disabled.
        </Notice>
      )}
      {optedOut > 0 && (
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          {optedOut} parent{optedOut === 1 ? " has" : "s have"} email alerts turned off and
          won&apos;t receive blasts; they still see announcements in the app.
        </p>
      )}

      <BuilderView brand={brand} students={students} parents={parentRows} />

      <BlastHistory
        blasts={blasts.map((b) => ({
          id: b.id,
          subject: b.subject,
          blocksJson: b.blocksJson,
          audience: b.audience,
          sentCount: b.sentCount,
          sender: senderName.get(b.senderId) ?? "—",
          createdAt: b.createdAt.toISOString(),
        }))}
        brand={brand}
      />
    </>
  );
}
