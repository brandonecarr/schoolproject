"use client";

// The question-list editor shared by the assignment builder (quiz type) and the
// worksheet builder. Manages a list of Items (mc / tf / short / fill), each with
// a prompt, points, and — where applicable — choices and a correct answer.

import { ITEM_KIND_LABEL, type Item, type ItemKind } from "@/lib/lms";

let seq = 0;
export const uid = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

export const blankItem = (kind: ItemKind = "mc", id?: string): Item => ({
  id: id ?? uid(),
  kind,
  prompt: "",
  choices: kind === "mc" ? ["", ""] : undefined,
  answerIndex: kind === "mc" || kind === "tf" ? 0 : undefined,
  answer: "",
  points: 2,
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
      xs.map((it) =>
        it.id === id
          ? {
              ...it,
              kind,
              choices: kind === "mc" ? it.choices ?? ["", ""] : undefined,
              answerIndex: kind === "mc" || kind === "tf" ? 0 : undefined,
            }
          : it
      )
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
                  aria-label="points"
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
