"use client";

// "Insert from bank" — pull saved questions into the quiz or worksheet you're
// building. Banks are passed in as props (a microschool has a handful, not
// thousands), so picking is instant and needs no fetch.
//
// Inserted items are given FRESH ids. The copy is independent of the bank: later
// edits to the bank don't silently rewrite a quiz a student has already sat.

import { useState } from "react";
import { ITEM_KIND_LABEL, type Item } from "@/lib/lms";
import { uid } from "@/components/ItemsEditor";

export type BankSummary = { id: string; name: string; subject: string; items: Item[] };

export function BankPicker({
  banks,
  onInsert,
}: {
  banks: BankSummary[];
  onInsert: (items: Item[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  if (banks.length === 0) return null;
  const bank = banks.find((b) => b.id === bankId);
  const items = bank?.items ?? [];

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const insert = () => {
    const chosen = items.filter((i) => picked.has(i.id)).map((i) => ({ ...i, id: uid() }));
    if (chosen.length) onInsert(chosen);
    setPicked(new Set());
    setOpen(false);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
        {open ? "Close bank" : "Insert from bank"}
      </button>

      {open && (
        <div className="subcard" style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label>Bank</label>
              <select
                value={bankId}
                onChange={(e) => {
                  setBankId(e.target.value);
                  setPicked(new Set());
                }}
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.subject ? ` · ${b.subject}` : ""} ({b.items.length})
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn sec sm" onClick={insert} disabled={picked.size === 0}>
              Insert {picked.size || ""}
            </button>
          </div>

          <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto" }}>
            {items.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                This bank is empty.
              </p>
            ) : (
              items.map((i) => (
                <label
                  key={i.id}
                  className="check"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "7px 0",
                    borderTop: "1px solid var(--rule)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(i.id)}
                    onChange={() => toggle(i.id)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ fontWeight: 600 }}>{i.prompt || "(no prompt)"}</span>
                    <span className="small muted" style={{ display: "block" }}>
                      {ITEM_KIND_LABEL[i.kind] ?? i.kind} · {i.points} pts
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
