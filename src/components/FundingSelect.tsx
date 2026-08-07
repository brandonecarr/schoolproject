"use client";

// Funding picker for the enroll form. Client-side only so that choosing a
// program can prefill the award amount — the teacher shouldn't have to look up
// what her state pays before she can add a child.
//
// The prefill is a SUGGESTION and gets out of the way the moment it's wrong:
// once the teacher types her own figure, changing the program never overwrites
// it. Real awards are prorated, tiered, and set per family, so the number on
// the award letter always wins over the one in our table.

import { useRef, useState } from "react";
import type { Program } from "@/lib/rules";

type Option = Program & { code: string; railLabel: string };

export function FundingSelect({ groups }: { groups: { label: string; items: Option[] }[] }) {
  const amountRef = useRef<HTMLInputElement>(null);
  // What we last wrote into the amount box. If the box still holds that value,
  // it's ours to replace; anything else is the teacher's and stays.
  const [suggested, setSuggested] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const all = groups.flatMap((g) => g.items);

  function onProgramChange(code: string) {
    const p = all.find((o) => o.code === code);
    const box = amountRef.current;
    if (box && (box.value === "" || box.value === suggested)) {
      const next = p ? String(p.amount) : "";
      box.value = next;
      setSuggested(next);
    }
    setNote(
      !p
        ? null
        : [
            `Paid through ${p.railLabel}.`,
            p.live ? null : "Enacted but not yet disbursing — you can plan, but don't invoice yet.",
            p.limited ? `Eligibility: ${p.limited.toLowerCase()}.` : null,
            p.alsoRuns?.length ? `This state also runs: ${p.alsoRuns.join("; ")}.` : null,
          ]
            .filter(Boolean)
            .join(" ")
    );
  }

  return (
    <>
      <div style={{ flex: 1, minWidth: 180 }}>
        <label htmlFor="esaProgram">Funding</label>
        <select
          id="esaProgram"
          name="esaProgram"
          defaultValue=""
          onChange={(e) => onProgramChange(e.target.value)}
        >
          <option value="">Private pay (no ESA)</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label} — {p.railLabel}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          {note ?? "⚑ Program rules here are unverified starting points — confirm against the family’s award letter before your first invoice."}
        </p>
      </div>
      <div style={{ flex: 1, minWidth: 140 }}>
        <label htmlFor="esaAmount">ESA amount / yr</label>
        <input ref={amountRef} id="esaAmount" name="esaAmount" type="number" min={0} placeholder="0" />
      </div>
    </>
  );
}
