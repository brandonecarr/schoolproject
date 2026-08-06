"use client";

// Build a reusable worksheet: a title, subject, instructions, and a list of
// questions (shared ItemsEditor). Serializes the items into a hidden field the
// createWorksheet server action reads.

import { useMemo, useState } from "react";
import { quizMax, type Item } from "@/lib/lms";
import { ItemsEditor, blankItem } from "@/components/ItemsEditor";

export function WorksheetBuilder({ action }: { action: (fd: FormData) => void }) {
  // Fixed ids for initial rows to keep SSR and client hydration identical.
  const [items, setItems] = useState<Item[]>(() => [blankItem("mc", "w0"), blankItem("short", "w1")]);
  const itemsJson = useMemo(() => JSON.stringify(items), [items]);
  const total = useMemo(() => quizMax(items), [items]);

  return (
    <form action={action} className="card builder">
      <input type="hidden" name="items" value={itemsJson} />
      <div className="eyebrow">New worksheet</div>
      <div className="row" style={{ gap: 12, marginTop: 8 }}>
        <div style={{ flex: 2, minWidth: 240 }}>
          <label htmlFor="wt">Title</label>
          <input id="wt" name="title" required placeholder="Multiplication facts — 6s and 7s" />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="ws">Subject</label>
          <input id="ws" name="subject" placeholder="Math" />
        </div>
      </div>
      <label htmlFor="wi">Instructions (printed at the top)</label>
      <textarea id="wi" name="instructions" placeholder="Show your work. Circle your final answer." />

      <ItemsEditor items={items} setItems={setItems} />

      <div className="spread" style={{ marginTop: 16, alignItems: "center" }}>
        <span className="small muted">
          {items.length} question{items.length === 1 ? "" : "s"} · {total} pts
        </span>
        <button className="btn">Save worksheet</button>
      </div>
    </form>
  );
}
