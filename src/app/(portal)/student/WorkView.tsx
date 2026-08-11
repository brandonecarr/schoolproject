"use client";

// "What's next" with the slide-out treatment: tap an assignment and its
// card slides out — what it is, which course, when it's due, and the one
// button that matters. URL-backed via ?work=<submissionId>.

import Link from "next/link";
import { dueLabel } from "@/lib/due-label";
import { Pill } from "@/components/ui";
import { useShallowParams } from "@/components/use-shallow-params";
import { SidePanel, SideSection, SideKV } from "@/components/SidePanel";

export type WorkRow = {
  submissionId: string;
  title: string;
  courseName: string;
  typeLabel: string;
  icon: string;
  daysLeft: number;
  needsChanges: boolean;
};

export function WorkView({ rows }: { rows: WorkRow[] }) {
  const [params, updateParams] = useShallowParams();
  const open = rows.find((r) => r.submissionId === params.get("work")) ?? null;
  const close = () => updateParams((p) => p.delete("work"));

  return (
    <>
      <div className="worklist">
        {rows.map((d) => {
          const tone = d.daysLeft < 0 ? "bad" : d.daysLeft <= 1 ? "warn" : "info";
          return (
            <a
              key={d.submissionId}
              href="/student/work"
              className="workrow"
              onClick={(e) => {
                e.preventDefault();
                updateParams((p) => p.set("work", d.submissionId));
              }}
            >
              <span className="worktile" aria-hidden>
                {d.icon}
              </span>
              <span className="grow">
                <span className="worktitle" style={{ display: "block" }}>
                  {d.title}
                </span>
                <span className="workmeta" style={{ display: "block" }}>
                  {d.courseName} · {d.typeLabel}
                  {d.needsChanges ? " · needs changes" : ""}
                </span>
              </span>
              <Pill tone={tone}>{dueLabel(d.daysLeft)}</Pill>
            </a>
          );
        })}
      </div>

      {open && (
        <SidePanel
          title={open.title}
          onClose={close}
          meta={
            <>
              <Pill tone={open.daysLeft < 0 ? "bad" : open.daysLeft <= 1 ? "warn" : "info"}>
                {dueLabel(open.daysLeft)}
              </Pill>
              <span>{open.courseName}</span>
            </>
          }
          footer={
            <Link className="btn" href="/student/work" style={{ gridColumn: "1 / -1" }}>
              {open.needsChanges ? "Fix it now" : "Open my work"}
            </Link>
          }
        >
          <div className="app-side-id">
            <span className="app-side-mono" aria-hidden>
              {open.icon}
            </span>
          </div>
          <SideSection label="This assignment">
            <SideKV k="Course" v={open.courseName} />
            <SideKV k="Type" v={open.typeLabel} />
            <SideKV k="Due" v={dueLabel(open.daysLeft)} />
            {open.needsChanges && (
              <SideKV k="Status" v={<Pill tone="bad">Needs changes</Pill>} />
            )}
          </SideSection>
        </SidePanel>
      )}
    </>
  );
}
