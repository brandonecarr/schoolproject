import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/dates";
import { Pill, Notice } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import {
  saveProgressReport,
  approveProgressReport,
  unapproveProgressReport,
  deleteProgressReport,
} from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progress report — Cohort" };

const SOURCE_LABEL: Record<string, string> = {
  ai: "Drafted by Cohort AI from this period's records",
  template: "Assembled by Cohort from this period's records",
  edited: "Edited by you",
};

export default async function ProgressReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; approved?: string; pulled?: string; err?: string }>;
}) {
  const { school } = await requireTeacher();
  const { id } = await params;
  const sp = await searchParams;

  const rep = await prisma.progressReport.findFirst({ where: { id, schoolId: school!.id } });
  if (!rep) notFound();
  const student = await prisma.student.findUnique({ where: { id: rep.studentId } });
  const approved = rep.status === "approved";

  return (
    <>
      {sp.saved && <Notice tone="good">Changes saved. Approve it when you&apos;re happy with it.</Notice>}
      {sp.approved && (
        <Notice tone="good">
          Approved — {student?.name.split(" ")[0] ?? "this student"}&apos;s family can now read this
          report, and it appears in their printable record.
        </Notice>
      )}
      {sp.pulled && <Notice tone="warn">Pulled back to draft. The family can no longer see it.</Notice>}
      {sp.err === "empty" && <Notice tone="bad">Write something before approving.</Notice>}

      <div className="topbar">
        <div>
          <div className="eyebrow">
            Progress report · {fmt(rep.periodStart)} – {fmt(rep.periodEnd)}
          </div>
          <h1>{student?.name ?? "—"}</h1>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <Pill tone={approved ? "good" : "warn"}>{approved ? "Approved" : "Draft"}</Pill>
          <Link className="btn ghost sm" href="/reports">
            All reports
          </Link>
        </div>
      </div>

      {!approved && (
        <div className="notice info">
          <strong>Nothing has been shared yet.</strong> This is a draft assembled from the records —
          read every line and correct anything that isn&apos;t right. It only reaches the family when
          you approve it.
        </div>
      )}

      <form action={saveProgressReport} className="card">
        <input type="hidden" name="id" value={rep.id} />
        <label htmlFor="narrative">Report</label>
        <textarea
          id="narrative"
          name="narrative"
          defaultValue={rep.narrative}
          style={{ minHeight: 260, fontSize: 15.5, lineHeight: 1.65 }}
        />
        <div className="spread" style={{ marginTop: 12, alignItems: "center" }}>
          <span className="small muted">
            {SOURCE_LABEL[rep.source] ?? rep.source} · {rep.createdByName} ·{" "}
            {fmt(rep.createdAt.toISOString().slice(0, 10))}
            {approved && rep.approvedByName ? ` · approved by ${rep.approvedByName}` : ""}
          </span>
          <button className="btn sec">Save changes</button>
        </div>
      </form>

      <div className="card">
        {approved ? (
          <>
            <div className="eyebrow">Shared with the family</div>
            <p className="small muted" style={{ margin: "6px 0 12px" }}>
              Approved{rep.approvedAt ? ` on ${fmt(rep.approvedAt.slice(0, 10))}` : ""} by{" "}
              {rep.approvedByName ?? "—"}. It shows in the parent portal and in{" "}
              {student?.name.split(" ")[0] ?? "the student"}&apos;s printable record.
            </p>
            <form action={unapproveProgressReport}>
              <input type="hidden" name="id" value={rep.id} />
              <button className="btn ghost sm">Pull back to draft</button>
            </form>
          </>
        ) : (
          <>
            <div className="eyebrow">Approve and share</div>
            <p className="small muted" style={{ margin: "6px 0 12px", maxWidth: "62ch" }}>
              Approving publishes this to the family and includes it in the printable student record.
              You can pull it back afterwards if you spot a mistake.
            </p>
            <form action={approveProgressReport}>
              <input type="hidden" name="id" value={rep.id} />
              <button className="btn mark">Approve &amp; share with family</button>
            </form>
          </>
        )}
      </div>

      <div className="sep" />
      <details>
        <summary className="small muted" style={{ cursor: "pointer" }}>
          Delete this report
        </summary>
        <form action={deleteProgressReport} style={{ marginTop: 10 }}>
          <input type="hidden" name="id" value={rep.id} />
          <ConfirmSubmit className="btn ghost sm" message="Delete this progress report permanently?">
            Delete report
          </ConfirmSubmit>
        </form>
      </details>
    </>
  );
}
