"use client";

// One assignment, from the student's side. Switches its completion UI on the
// assignment type: written response, quiz (live answers), photo/file upload,
// reading check-off, or rubric project. Handles draft-save and resubmission of
// returned work. Posts to the submitWork / saveDraft server actions passed in.

import { useState } from "react";
import {
  parseItems,
  rubricConfig,
  checkoffConfig,
  typeMeta,
  type Item,
  type QuizAnswer,
} from "@/lib/lms";

export type SubData = {
  id: string;
  status: string;
  responseText: string;
  answersJson: string;
  revisionNote: string;
  score: number | null;
  feedback: string;
  fileId: string | null;
};

export type AsgData = {
  id: string;
  title: string;
  type: string;
  instructions: string;
  points: number;
  dueDate: string;
  configJson: string;
  allowResubmit: boolean;
  resourceFileId: string | null;
  courseName: string;
  fmtDue: string;
  overdue: boolean;
};

export function WorkCard({
  sub,
  asg,
  submit,
  saveDraft,
}: {
  sub: SubData;
  asg: AsgData;
  submit: (fd: FormData) => void;
  saveDraft: (fd: FormData) => void;
}) {
  const m = typeMeta(asg.type);
  const returned = sub.status === "returned";
  const canDraft = asg.type === "written" || asg.type === "quiz" || asg.type === "rubric";

  return (
    <form action={submit} className="card workcard">
      <input type="hidden" name="id" value={sub.id} />

      <div className="spread" style={{ gap: 8, alignItems: "flex-start" }}>
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <div className="marker" aria-hidden>
            {m.icon}
          </div>
          <div>
            <div className="eyebrow">
              {asg.courseName} · {m.label} · due {asg.fmtDue}
            </div>
            <h3 style={{ margin: "3px 0 0" }}>{asg.title}</h3>
          </div>
        </div>
        {asg.overdue && <span className="pill bad">Overdue</span>}
        {returned && <span className="pill warn">Please revise</span>}
      </div>

      {asg.instructions && (
        <p className="small" style={{ margin: "10px 0 4px" }}>
          {asg.instructions}
        </p>
      )}

      {asg.resourceFileId && (
        <a className="reslink small" href={`/files/${asg.resourceFileId}`} target="_blank" rel="noreferrer">
          ▤ Open the attached resource
        </a>
      )}

      {returned && sub.revisionNote && (
        <div className="notice bad" style={{ margin: "10px 0 0" }}>
          <strong>Teacher asked for changes:</strong> {sub.revisionNote}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {asg.type === "quiz" && <QuizBody asg={asg} sub={sub} />}
        {asg.type === "written" && <WrittenBody sub={sub} />}
        {asg.type === "rubric" && <RubricBody asg={asg} sub={sub} />}
        {asg.type === "upload" && <UploadBody sub={sub} />}
        {asg.type === "checkoff" && <CheckoffBody asg={asg} sub={sub} />}
      </div>

      <div className="row" style={{ gap: 10, marginTop: 12 }}>
        <button className="btn mark">{returned ? "Turn in again" : m.studentCta}</button>
        {canDraft && (
          <button className="btn ghost sm" formAction={saveDraft} formNoValidate>
            Save draft
          </button>
        )}
      </div>
    </form>
  );
}

function WrittenBody({ sub }: { sub: SubData }) {
  return (
    <>
      <label htmlFor={`r_${sub.id}`}>Your answer</label>
      <textarea
        id={`r_${sub.id}`}
        name="responseText"
        required
        defaultValue={sub.responseText}
        placeholder="Type your work here, or describe what you did on paper."
      />
    </>
  );
}

function RubricBody({ asg, sub }: { asg: AsgData; sub: SubData }) {
  const { criteria } = rubricConfig(asg.configJson);
  return (
    <>
      {criteria.length > 0 && (
        <div className="subcard" style={{ marginBottom: 10 }}>
          <div className="eyebrow" style={{ margin: 0 }}>
            You’ll be graded on
          </div>
          <ul className="crit-list">
            {criteria.map((c) => (
              <li key={c.id}>
                {c.label} <span className="muted">· {c.max} pts</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <label htmlFor={`r_${sub.id}`}>Your response</label>
      <textarea
        id={`r_${sub.id}`}
        name="responseText"
        defaultValue={sub.responseText}
        placeholder="Explain your project, or describe the work you’re turning in."
      />
      <label className="filepick small" style={{ marginTop: 8 }}>
        Attach a photo or PDF (optional)
        <input type="file" name="file" accept="image/*,application/pdf" />
      </label>
    </>
  );
}

function UploadBody({ sub }: { sub: SubData }) {
  return (
    <>
      <label className="dropzone">
        <span className="dz-ic" aria-hidden>
          ▤
        </span>
        <span>Choose a photo or PDF of your work</span>
        <input type="file" name="file" accept="image/*,application/pdf" required />
      </label>
      <label htmlFor={`n_${sub.id}`} style={{ marginTop: 8 }}>
        Anything to tell your teacher? (optional)
      </label>
      <input
        id={`n_${sub.id}`}
        name="responseText"
        defaultValue={sub.responseText}
        placeholder="I did the odd problems on page 12."
      />
    </>
  );
}

function CheckoffBody({ asg, sub }: { asg: AsgData; sub: SubData }) {
  const cfg = checkoffConfig(asg.configJson);
  if (!cfg.reflection) {
    return (
      <p className="small muted" style={{ margin: 0 }}>
        When you’ve finished, press the button to mark it complete.
      </p>
    );
  }
  return (
    <>
      <label htmlFor={`ref_${sub.id}`}>One thing you learned or did</label>
      <input
        id={`ref_${sub.id}`}
        name="reflection"
        required
        placeholder="I read to page 52 and learned how volcanoes form."
      />
    </>
  );
}

function QuizBody({ asg, sub }: { asg: AsgData; sub: SubData }) {
  const items = parseItems(asg.configJson);
  const initial: Record<string, number | string> = {};
  try {
    (JSON.parse(sub.answersJson || "[]") as QuizAnswer[]).forEach((a) => {
      initial[a.itemId] = a.value;
    });
  } catch {
    /* no prior answers */
  }
  const [answers, setAnswers] = useState<Record<string, number | string>>(initial);
  const set = (itemId: string, value: number | string) =>
    setAnswers((prev) => ({ ...prev, [itemId]: value }));

  const serialized = JSON.stringify(
    Object.entries(answers).map(([itemId, value]) => ({ itemId, value }))
  );

  return (
    <div className="quizbody">
      <input type="hidden" name="answers" value={serialized} />
      {items.map((it, qi) => (
        <div key={it.id} className="qblock">
          <div className="qhead">
            <span className="qn">{qi + 1}</span>
            <span className="qp">{it.prompt || "—"}</span>
            <span className="qpts small muted">{it.points} pts</span>
          </div>
          <QuestionInput item={it} value={answers[it.id]} onChange={(v) => set(it.id, v)} />
        </div>
      ))}
      {items.length === 0 && <p className="small muted">This quiz has no questions yet.</p>}
    </div>
  );
}

function QuestionInput({
  item,
  value,
  onChange,
}: {
  item: Item;
  value: number | string | undefined;
  onChange: (v: number | string) => void;
}) {
  if (item.kind === "mc") {
    return (
      <div className="choices">
        {(item.choices ?? []).map((ch, idx) => (
          <label key={idx} className={`choice ${value === idx ? "on" : ""}`}>
            <input
              type="radio"
              name={`q_${item.id}`}
              checked={value === idx}
              onChange={() => onChange(idx)}
            />
            <span>{ch || `Choice ${idx + 1}`}</span>
          </label>
        ))}
      </div>
    );
  }
  if (item.kind === "tf") {
    return (
      <div className="choices">
        {["True", "False"].map((lb, idx) => (
          <label key={lb} className={`choice ${value === idx ? "on" : ""}`}>
            <input
              type="radio"
              name={`q_${item.id}`}
              checked={value === idx}
              onChange={() => onChange(idx)}
            />
            <span>{lb}</span>
          </label>
        ))}
      </div>
    );
  }
  // short / fill
  return (
    <input
      className="qtext"
      placeholder={item.kind === "fill" ? "Fill in the blank" : "Your answer"}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
