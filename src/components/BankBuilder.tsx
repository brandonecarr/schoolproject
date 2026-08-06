"use client";

// Build a question bank — the same ItemsEditor used everywhere else, so every
// question kind is available here too.

import { useMemo, useState } from "react";
import { quizMax, type Item } from "@/lib/lms";
import { ItemsEditor, blankItem } from "@/components/ItemsEditor";

export function BankBuilder({ action }: { action: (fd: FormData) => void }) {
  // Fixed ids on the initial rows keep SSR and hydration identical.
  const [items, setItems] = useState<Item[]>(() => [blankItem("mc", "b0")]);
  const itemsJson = useMemo(() => JSON.stringify(items), [items]);
  const total = useMemo(() => quizMax(items), [items]);

  return (
    <details className="card builder">
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>New question bank</summary>
      <form action={action} style={{ marginTop: 10 }}>
        <input type="hidden" name="items" value={itemsJson} />
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label htmlFor="bname">Name</label>
            <input id="bname" name="name" required placeholder="Fractions — recall questions" />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="bsubject">Subject</label>
            <input id="bsubject" name="subject" placeholder="Math" />
          </div>
        </div>

        <ItemsEditor items={items} setItems={setItems} heading="Questions in this bank" />

        <div className="spread" style={{ marginTop: 16, alignItems: "center" }}>
          <span className="small muted">
            {items.length} question{items.length === 1 ? "" : "s"} · {total} pts
          </span>
          <button className="btn mark">Save bank</button>
        </div>
      </form>
    </details>
  );
}
