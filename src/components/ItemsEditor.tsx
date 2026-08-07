"use client";

// The question-list editor shared by the assignment builder (quiz type) and the
// worksheet builder. Manages a list of Items (mc / tf / short / fill), each with
// a prompt, points, and — where applicable — choices and a correct answer.

import { ITEM_KIND_LABEL, type Item, type ItemKind, type MatchPair } from "@/lib/lms";

let seq = 0;
export const uid = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

// Fields each kind needs, so switching kind doesn't leave stale data behind.
function shapeFor(kind: ItemKind, prev?: Partial<Item>): Partial<Item> {
  switch (kind) {
    case "mc":
      return { choices: prev?.choices ?? ["", ""], answerIndex: 0 };
    case "multi":
      return { choices: prev?.choices ?? ["", ""], answerIndices: [] };
    case "tf":
      return { answerIndex: 0 };
    case "numeric":
      return { numAnswer: undefined, tolerance: 0 };
    case "matching":
      return {
        pairs: prev?.pairs ?? [
          { left: "", right: "" },
          { left: "", right: "" },
        ],
      };
    case "ordering":
      return { ordering: prev?.ordering ?? ["", ""] };
    default:
      return { answer: prev?.answer ?? "" };
  }
}

export const blankItem = (kind: ItemKind = "mc", id?: string): Item => ({
  id: id ?? uid(),
  kind,
  prompt: "",
  points: 2,
  ...shapeFor(kind),
});

export function ItemsEditor({
  items,
  setItems,
  heading = "Questions",
}: {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  heading?: string;
}) {
  const setItem = (id: string, patch: Partial<Item>) =>
    setItems((xs) => xs.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const changeKind = (id: string, kind: ItemKind) =>
    setItems((xs) =>
      xs.map((it) => {
        if (it.id !== id) return it;
        // Drop every kind-specific field, then re-add just the ones this kind
        // uses — otherwise a question that used to be multiple-choice keeps
        // invisible answer data that would confuse scoring.
        const { id: keepId, prompt, points } = it;
        return { id: keepId, prompt, points, kind, ...shapeFor(kind, it) } as Item;
      })
    );

  return (
    <div style={{ marginTop: 14 }}>
      <div className="eyebrow">{heading}</div>
      {items.map((it, qi) => (
        <div key={it.id} className="subcard qitem">
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <div className="qnum">{qi + 1}</div>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 10 }}>
                <select
                  value={it.kind}
                  onChange={(e) => changeKind(it.id, e.target.value as ItemKind)}
                  style={{ width: 170 }}
                  aria-label={`Question ${qi + 1} type`}
                >
                  {(Object.keys(ITEM_KIND_LABEL) as ItemKind[]).map((k) => (
                    <option key={k} value={k}>
                      {ITEM_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={it.points}
                  min={1}
                  onChange={(e) => setItem(it.id, { points: Number(e.target.value) || 1 })}
                  style={{ width: 90 }}
                  aria-label={`Question ${qi + 1} points`}
                />
                <span className="small muted" style={{ alignSelf: "center" }}>
                  pts
                </span>
              </div>
              <input
                style={{ marginTop: 8 }}
                placeholder="Question prompt"
                value={it.prompt}
                onChange={(e) => setItem(it.id, { prompt: e.target.value })}
              />

              {it.kind === "mc" && <McChoices item={it} setItem={setItem} />}
              {it.kind === "multi" && <MultiChoices item={it} setItem={setItem} />}
              {it.kind === "numeric" && <NumericAnswer item={it} setItem={setItem} />}
              {it.kind === "matching" && <MatchingPairs item={it} setItem={setItem} />}
              {it.kind === "ordering" && <OrderingSteps item={it} setItem={setItem} />}
              {it.kind === "tf" && (
                <div className="row" style={{ gap: 14, marginTop: 8 }}>
                  {["True", "False"].map((lb, idx) => (
                    <label key={lb} className="check">
                      <input
                        type="radio"
                        name={`tf_${it.id}`}
                        checked={it.answerIndex === idx}
                        onChange={() => setItem(it.id, { answerIndex: idx })}
                      />
                      {lb}
                    </label>
                  ))}
                  <span className="small muted" style={{ alignSelf: "center" }}>
                    correct answer
                  </span>
                </div>
              )}
              {it.kind === "fill" && (
                <input
                  style={{ marginTop: 8 }}
                  placeholder="Expected answer (leave blank to grade by hand)"
                  value={it.answer || ""}
                  onChange={(e) => setItem(it.id, { answer: e.target.value })}
                />
              )}
              {(it.kind === "matching" || it.kind === "ordering") && (
                <p className="small muted" style={{ margin: "8px 0 0" }}>
                  Students see these shuffled, and partial credit is given for the parts they get
                  right.
                </p>
              )}
              {it.kind === "short" && (
                <p className="small muted" style={{ margin: "8px 0 0" }}>
                  You’ll grade this one by hand.
                </p>
              )}
            </div>
            <button
              type="button"
              className="xbtn"
              aria-label="Remove question"
              onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => setItems((xs) => [...xs, blankItem()])}
      >
        + Add question
      </button>
    </div>
  );
}

// Choose all that apply — same option list as mc, but many correct answers.
function MultiChoices({
  item,
  setItem,
}: {
  item: Item;
  setItem: (id: string, patch: Partial<Item>) => void;
}) {
  const choices = item.choices ?? [];
  const correct = new Set(item.answerIndices ?? []);
  const setChoice = (idx: number, val: string) => {
    const next = choices.slice();
    next[idx] = val;
    setItem(item.id, { choices: next });
  };
  const toggle = (idx: number) => {
    const next = new Set(correct);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setItem(item.id, { answerIndices: [...next].sort((a, b) => a - b) });
  };
  return (
    <div style={{ marginTop: 8 }}>
      {choices.map((ch, idx) => (
        <div key={idx} className="row" style={{ gap: 8, marginTop: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={correct.has(idx)}
            onChange={() => toggle(idx)}
            aria-label="mark correct"
          />
          <input
            style={{ flex: 1 }}
            placeholder={`Choice ${idx + 1}`}
            value={ch}
            onChange={(e) => setChoice(idx, e.target.value)}
          />
          {choices.length > 2 && (
            <button
              type="button"
              className="xbtn"
              aria-label="Remove choice"
              onClick={() =>
                setItem(item.id, {
                  choices: choices.filter((_, i) => i !== idx),
                  answerIndices: [...correct]
                    .filter((i) => i !== idx)
                    .map((i) => (i > idx ? i - 1 : i)),
                })
              }
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="linkbtn small"
        style={{ marginTop: 8 }}
        onClick={() => setItem(item.id, { choices: [...choices, ""] })}
      >
        + Add choice
      </button>
      <span className="small muted" style={{ marginLeft: 10 }}>
        ☑ every correct answer · all-or-nothing credit
      </span>
    </div>
  );
}

function NumericAnswer({
  item,
  setItem,
}: {
  item: Item;
  setItem: (id: string, patch: Partial<Item>) => void;
}) {
  return (
    <div className="row" style={{ gap: 10, marginTop: 8, alignItems: "flex-end" }}>
      <div style={{ width: 150 }}>
        <label>Correct value</label>
        <input
          type="number"
          step="any"
          value={item.numAnswer ?? ""}
          placeholder="e.g. 42"
          onChange={(e) =>
            setItem(item.id, {
              numAnswer: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
        />
      </div>
      <div style={{ width: 150 }}>
        <label>Allow ± </label>
        <input
          type="number"
          step="any"
          min={0}
          value={item.tolerance ?? 0}
          onChange={(e) => setItem(item.id, { tolerance: Number(e.target.value) || 0 })}
        />
      </div>
      <span className="small muted" style={{ paddingBottom: 10 }}>
        Leave the value blank to grade this one by hand.
      </span>
    </div>
  );
}

// Matching — authored as aligned pairs; students see the right column shuffled.
function MatchingPairs({
  item,
  setItem,
}: {
  item: Item;
  setItem: (id: string, patch: Partial<Item>) => void;
}) {
  const pairs: MatchPair[] = item.pairs ?? [];
  const set = (idx: number, patch: Partial<MatchPair>) => {
    const next = pairs.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    setItem(item.id, { pairs: next });
  };
  return (
    <div style={{ marginTop: 8 }}>
      {pairs.map((p, idx) => (
        <div key={idx} className="row" style={{ gap: 8, marginTop: 6, alignItems: "center" }}>
          <input
            style={{ flex: 1 }}
            placeholder={`Prompt ${idx + 1}`}
            value={p.left}
            onChange={(e) => set(idx, { left: e.target.value })}
          />
          <span className="small muted">→</span>
          <input
            style={{ flex: 1 }}
            placeholder={`Match ${idx + 1}`}
            value={p.right}
            onChange={(e) => set(idx, { right: e.target.value })}
          />
          {pairs.length > 2 && (
            <button
              type="button"
              className="xbtn"
              aria-label="Remove pair"
              onClick={() => setItem(item.id, { pairs: pairs.filter((_, i) => i !== idx) })}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="linkbtn small"
        style={{ marginTop: 8 }}
        onClick={() => setItem(item.id, { pairs: [...pairs, { left: "", right: "" }] })}
      >
        + Add pair
      </button>
    </div>
  );
}

// Ordering — authored in the CORRECT order; students see them shuffled.
function OrderingSteps({
  item,
  setItem,
}: {
  item: Item;
  setItem: (id: string, patch: Partial<Item>) => void;
}) {
  const steps = item.ordering ?? [];
  const set = (idx: number, val: string) => {
    const next = steps.slice();
    next[idx] = val;
    setItem(item.id, { ordering: next });
  };
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= steps.length) return;
    const next = steps.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setItem(item.id, { ordering: next });
  };
  return (
    <div style={{ marginTop: 8 }}>
      <div className="small muted">Enter them in the correct order.</div>
      {steps.map((s, idx) => (
        <div key={idx} className="row" style={{ gap: 8, marginTop: 6, alignItems: "center" }}>
          <span className="small muted" style={{ width: 18 }}>
            {idx + 1}.
          </span>
          <input
            style={{ flex: 1 }}
            placeholder={`Step ${idx + 1}`}
            value={s}
            onChange={(e) => set(idx, e.target.value)}
          />
          <button type="button" className="xbtn" onClick={() => move(idx, -1)} aria-label="Move up">
            ↑
          </button>
          <button type="button" className="xbtn" onClick={() => move(idx, 1)} aria-label="Move down">
            ↓
          </button>
          {steps.length > 2 && (
            <button
              type="button"
              className="xbtn"
              aria-label="Remove step"
              onClick={() => setItem(item.id, { ordering: steps.filter((_, i) => i !== idx) })}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="linkbtn small"
        style={{ marginTop: 8 }}
        onClick={() => setItem(item.id, { ordering: [...steps, ""] })}
      >
        + Add step
      </button>
    </div>
  );
}

function McChoices({
  item,
  setItem,
}: {
  item: Item;
  setItem: (id: string, patch: Partial<Item>) => void;
}) {
  const choices = item.choices ?? [];
  const set = (idx: number, val: string) => {
    const next = choices.slice();
    next[idx] = val;
    setItem(item.id, { choices: next });
  };
  return (
    <div style={{ marginTop: 8 }}>
      {choices.map((ch, idx) => (
        <div key={idx} className="row" style={{ gap: 8, marginTop: 6, alignItems: "center" }}>
          <input
            type="radio"
            name={`mc_${item.id}`}
            checked={item.answerIndex === idx}
            onChange={() => setItem(item.id, { answerIndex: idx })}
            aria-label="mark correct"
          />
          <input
            style={{ flex: 1 }}
            placeholder={`Choice ${idx + 1}`}
            value={ch}
            onChange={(e) => set(idx, e.target.value)}
          />
          {choices.length > 2 && (
            <button
              type="button"
              className="xbtn"
              aria-label="Remove choice"
              onClick={() =>
                setItem(item.id, {
                  choices: choices.filter((_, i) => i !== idx),
                  answerIndex: item.answerIndex === idx ? 0 : item.answerIndex,
                })
              }
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="linkbtn small"
        style={{ marginTop: 8 }}
        onClick={() => setItem(item.id, { choices: [...choices, ""] })}
      >
        + Add choice
      </button>
      <span className="small muted" style={{ marginLeft: 10 }}>
        ● marks the correct answer
      </span>
    </div>
  );
}
