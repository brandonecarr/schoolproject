import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { pathForStudent } from "@/lib/path";
import { overallProgress, KIND_ICON } from "@/lib/modules";

export const dynamic = "force-dynamic";
export const metadata = { title: "My path — Cohort" };

export default async function StudentPathPage() {
  const { user } = await requireRole("student");
  const sid = user.studentId ?? "";
  const { states, pageTitles, assignmentTitles } = await pathForStudent(sid, user.schoolId);
  const overall = overallProgress(states);

  return (
    <>
      <div className="spread" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Step by step</div>
          <h1 style={{ margin: "2px 0 0" }}>My path</h1>
        </div>
        <Link className="small" href="/student">
          ← Home
        </Link>
      </div>

      {states.length === 0 ? (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="muted" style={{ margin: 0 }}>
            Your teacher hasn&apos;t set up a path yet. Check <Link href="/student/work">My work</Link>{" "}
            for what to do today.
          </p>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="spread" style={{ alignItems: "baseline" }}>
              <span className="eyebrow" style={{ margin: 0 }}>
                Overall progress
              </span>
              <strong>
                {overall.done} of {overall.total} done
              </strong>
            </div>
            <div className="xpbar" style={{ marginTop: 8 }}>
              <div className="track">
                <div className="fill" style={{ width: `${overall.pct}%` }} />
              </div>
            </div>
          </div>

          {states.map((st) => (
            <div key={st.module.id} className={`card mod-card ${st.locked ? "locked" : ""}`}>
              <div className="spread" style={{ gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0 }}>
                    {st.complete && <span aria-hidden style={{ marginRight: 6 }}>✓</span>}
                    {st.module.name}
                  </h2>
                  {st.module.description && (
                    <p className="small muted" style={{ margin: "4px 0 0" }}>
                      {st.module.description}
                    </p>
                  )}
                </div>
                <span className={`pill ${st.locked ? "warn" : st.complete ? "good" : "info"}`}>
                  {st.locked ? `🔒 ${st.lockReason}` : st.complete ? "Complete" : `${st.pct}%`}
                </span>
              </div>

              <div style={{ marginTop: 10 }}>
                {st.items.map((is) => {
                  const it = is.item;
                  if (it.kind === "header") {
                    return (
                      <div key={it.id} className="mod-header">
                        {it.title || "Section"}
                      </div>
                    );
                  }
                  const label =
                    it.title ||
                    (it.kind === "page"
                      ? pageTitles.get(it.refId) ?? "Page"
                      : assignmentTitles.get(it.refId) ?? "Assignment");
                  const href =
                    it.kind === "page" ? `/student/pages/${it.id}` : "/student/work";
                  const body = (
                    <>
                      <span className="mi-ic" aria-hidden>
                        {is.complete ? "✓" : is.locked ? "🔒" : KIND_ICON[it.kind]}
                      </span>
                      <span className="mi-main">
                        <span className="mi-title">{label}</span>
                        <span className="small muted">
                          {it.kind === "page" ? "Read" : "Assignment"}
                          {!it.required && " · optional"}
                          {is.locked && is.lockReason ? ` · ${is.lockReason}` : ""}
                        </span>
                      </span>
                    </>
                  );
                  return is.locked ? (
                    <div key={it.id} className="mod-item locked">
                      {body}
                    </div>
                  ) : (
                    <Link
                      key={it.id}
                      href={href}
                      className={`mod-item ${is.complete ? "done" : ""}`}
                    >
                      {body}
                    </Link>
                  );
                })}
                {st.items.length === 0 && (
                  <p className="small muted" style={{ margin: 0 }}>
                    Nothing in this module yet.
                  </p>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
