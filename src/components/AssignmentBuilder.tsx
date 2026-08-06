"use client";

// The teacher's assignment composer. A type picker swaps in the right builder —
// quiz items, rubric criteria, a check-off reflection toggle — and the whole
// config is serialized into a hidden field the addAssignment server action reads.
// Kept in one client component so the form is live without a round-trip.

import { useMemo, useState } from "react";
import {
  ASSIGNMENT_TYPES,
  TYPE_META,
  quizMax,
  rubricMax,
  type AssignmentType,
  type Item,
  type Criterion,
} from "@/lib/lms";
import { ItemsEditor, blankItem, uid } from "@/components/ItemsEditor";
import { MarkdownField } from "@/components/MarkdownField";
import { BankPicker, type BankSummary } from "@/components/BankPicker";

type CourseOpt = { id: string; name: string };
type StudentOpt = { id: string; name: string; grade: string };
type OutcomeOpt = { id: string; code: string; title: string; subject: string };

const blankCriterion = (id?: string): Criterion => ({ id: id ?? uid(), label: "", max: 5 });

export function AssignmentBuilder({
  action,
  courses,
  students,
  outcomes = [],
  banks = [],
  today,
}: {
  action: (fd: FormData) => void;
  courses: CourseOpt[];
  students: StudentOpt[];
  outcomes?: OutcomeOpt[];
  banks?: BankSummary[];
  today: string;
}) {
  const [type, setType] = useState<AssignmentType>("written");
  // Fixed ids for the initial rows so server and client render identically
  // (uid()/Date.now() during render would cause a hydration mismatch).
  const [items, setItems] = useState<Item[]>(() => [blankItem("mc", "q0")]);
  const [criteria, setCriteria] = useState<Criterion[]>(() => [
    blankCriterion("c0"),
    blankCriterion("c1"),
  ]);
  const [reflection, setReflection] = useState(true);
  const [flatPoints, setFlatPoints] = useState(20);
  const [targetAll, setTargetAll] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [standards, setStandards] = useState<Set<string>>(new Set());

  const configJson = useMemo(() => {
    if (type === "quiz") return JSON.stringify(items);
    if (type === "rubric") return JSON.stringify({ criteria });
    if (type === "checkoff") return JSON.stringify({ reflection });
    return "";
  }, [type, items, criteria, reflection]);

  const total = useMemo(() => {
    if (type === "quiz") return quizMax(items);
    if (type === "rubric") return rubricMax(criteria);
    return flatPoints;
  }, [type, items, criteria, flatPoints]);

  const targetsValue = targetAll || selected.size === 0 ? "*" : [...selected].join(",");

  return (
    <form action={action} className="card builder">
      {/* hidden serialized state */}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="config" value={configJson} />
      <input type="hidden" name="students" value={targetsValue} />
      <input type="hidden" name="outcomes" value={[...standards].join(",")} />
      {(type === "quiz" || type === "rubric") && <input type="hidden" name="points" value={total} />}

      {/* type picker */}
      <div className="eyebrow">What kind of work?</div>
      <div className="type-grid" style={{ marginTop: 8 }}>
        {ASSIGNMENT_TYPES.map((t) => {
          const m = TYPE_META[t];
          return (
            <button
              type="button"
              key={t}
              className={`type-card ${type === t ? "on" : ""}`}
              onClick={() => setType(t)}
            >
              <span className="tc-ic" aria-hidden>
                {m.icon}
              </span>
              <span className="tc-lb">{m.label}</span>
              <span className="tc-bl">{m.blurb}</span>
            </button>
          );
        })}
      </div>

      <div className="sep" />

      {/* common fields */}
      <div className="row" style={{ gap: 12 }}>
        <div style={{ flex: 2, minWidth: 240 }}>
          <label htmlFor="t">Title</label>
          <input id="t" name="title" required placeholder="Fractions on a number line" />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor="c">Course</label>
          <select id="c" name="courseId">
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <MarkdownField
        name="instructions"
        id="i"
        label="Instructions for the student"
        rows={5}
        placeholder="Place each fraction on the number line, then explain in one sentence how you decided."
      />

      {/* type-specific builder */}
      {type === "quiz" && (
        <>
          <ItemsEditor items={items} setItems={setItems} />
          <BankPicker banks={banks} onInsert={(added) => setItems((xs) => [...xs, ...added])} />
        </>
      )}

      {type === "rubric" && (
        <RubricBuilder criteria={criteria} setCriteria={setCriteria} />
      )}

      {type === "checkoff" && (
        <div className="subcard" style={{ marginTop: 14 }}>
          <label className="check">
            <input
              type="checkbox"
              checked={reflection}
              onChange={(e) => setReflection(e.target.checked)}
            />
            Ask the student for a one-line reflection when they mark it complete
          </label>
        </div>
      )}

      {type === "upload" && (
        <p className="small muted" style={{ marginTop: 12 }}>
          The student will turn in a photo or PDF. It’s saved as a work sample on their evidence
          board automatically — no scanning or re-uploading on your end.
        </p>
      )}

      <div className="sep" />

      {/* logistics */}
      <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
        <div style={{ width: 170 }}>
          <label htmlFor="d">Due</label>
          <input id="d" type="date" name="dueDate" defaultValue={today} />
        </div>
        <div style={{ width: 170 }}>
          <label htmlFor="av">Available from</label>
          <input id="av" type="date" name="assignedAt" defaultValue={today} />
        </div>
        {type === "quiz" || type === "rubric" ? (
          <div style={{ width: 120 }}>
            <label>Worth</label>
            <div className="pointsbox">{total} pts</div>
          </div>
        ) : (
          <div style={{ width: 120 }}>
            <label htmlFor="p">Points</label>
            <input
              id="p"
              type="number"
              name="points"
              value={flatPoints}
              min={1}
              onChange={(e) => setFlatPoints(Number(e.target.value) || 1)}
            />
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 20, marginTop: 12, alignItems: "center" }}>
        <label className="filepick small">
          Attach a resource
          <input type="file" name="resource" accept="image/*,application/pdf" />
        </label>
      </div>

      {/* standards alignment — what this work demonstrates */}
      {outcomes.length > 0 && (
        <div className="subcard" style={{ marginTop: 14 }}>
          <div className="spread">
            <div className="eyebrow" style={{ margin: 0 }}>
              Standards this demonstrates
            </div>
            <span className="small muted">
              {standards.size ? `${standards.size} selected` : "optional, but strong evidence"}
            </span>
          </div>
          <div className="chip-wrap" style={{ marginTop: 10 }}>
            {outcomes.map((o) => {
              const on = standards.has(o.id);
              return (
                <button
                  type="button"
                  key={o.id}
                  className={`chip ${on ? "on" : ""}`}
                  title={`${o.subject ? o.subject + " · " : ""}${o.title}`}
                  onClick={() =>
                    setStandards((prev) => {
                      const next = new Set(prev);
                      if (next.has(o.id)) next.delete(o.id);
                      else next.add(o.id);
                      return next;
                    })
                  }
                >
                  <strong>{o.code}</strong> <span className="muted">{o.title.slice(0, 34)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* targeting */}
      <div className="subcard" style={{ marginTop: 14 }}>
        <div className="spread">
          <div className="eyebrow" style={{ margin: 0 }}>
            Assign to
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={targetAll}
              onChange={(e) => setTargetAll(e.target.checked)}
            />
            Whole class ({students.length})
          </label>
        </div>
        {!targetAll && (
          <div className="chip-wrap" style={{ marginTop: 10 }}>
            {students.map((s) => {
              const on = selected.has(s.id);
              return (
                <button
                  type="button"
                  key={s.id}
                  className={`chip ${on ? "on" : ""}`}
                  onClick={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      return next;
                    })
                  }
                >
                  {s.name} <span className="muted">· {s.grade}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button className="btn" style={{ marginTop: 16 }}>
        {targetAll || selected.size === 0
          ? "Assign to all students"
          : `Assign to ${selected.size} student${selected.size === 1 ? "" : "s"}`}
      </button>
    </form>
  );
}

// --- Rubric criteria builder ---
function RubricBuilder({
  criteria,
  setCriteria,
}: {
  criteria: Criterion[];
  setCriteria: React.Dispatch<React.SetStateAction<Criterion[]>>;
}) {
  const set = (id: string, patch: Partial<Criterion>) =>
    setCriteria((xs) => xs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  return (
    <div style={{ marginTop: 14 }}>
      <div className="eyebrow">Rubric criteria</div>
      {criteria.map((c) => (
        <div key={c.id} className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
          <input
            style={{ flex: 1 }}
            placeholder="e.g. Use of evidence"
            value={c.label}
            onChange={(e) => set(c.id, { label: e.target.value })}
          />
          <input
            type="number"
            min={1}
            value={c.max}
            onChange={(e) => set(c.id, { max: Number(e.target.value) || 1 })}
            style={{ width: 90 }}
            aria-label="max points"
          />
          <span className="small muted">max</span>
          {criteria.length > 1 && (
            <button
              type="button"
              className="xbtn"
              aria-label="Remove criterion"
              onClick={() => setCriteria((xs) => xs.filter((x) => x.id !== c.id))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn ghost sm"
        style={{ marginTop: 10 }}
        onClick={() => setCriteria((xs) => [...xs, blankCriterion()])}
      >
        + Add criterion
      </button>
    </div>
  );
}
