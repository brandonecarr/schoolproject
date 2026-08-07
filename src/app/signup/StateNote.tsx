"use client";

// One line about the state you just typed, instead of a list of every state.
//
// This replaced a paragraph that printed all 23 configured state codes. Nobody
// reads a block of two-letter codes looking for their own, and the question a
// founder actually has is not "which states do you cover" — they cannot change
// their state — it is "what happens for MINE". So answer that, in one line,
// once there are two characters to answer it about.
//
// Same listen-on-the-form trick as SlugField: the state input stays
// uncontrolled so the whole form still submits with no client JavaScript. With
// JS off this component renders nothing at all, which is the correct amount of
// nothing — the information is a nicety, not a step in the task.

import { useEffect, useRef, useState } from "react";

export function StateNote({ programs }: { programs: Record<string, string> }) {
  const [code, setCode] = useState("");
  const box = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const onInput = (e: Event) => {
      const target = e.target as HTMLInputElement | null;
      if (target?.name !== "state") return;
      setCode(target.value.trim().toUpperCase());
    };
    form.addEventListener("input", onInput);
    return () => form.removeEventListener("input", onInput);
  }, []);

  // Nothing to say yet. Rendered as an empty paragraph rather than null so the
  // ref survives and the form listener stays attached.
  const label = code.length === 2 ? programs[code] : undefined;
  const text =
    code.length !== 2
      ? ""
      : label
        ? `${label} — invoice checks are configured for this program.`
        : `No ESA program configured for ${code}. Everything else works the same.`;

  return (
    <p
      className="small muted"
      ref={box}
      aria-live="polite"
      style={{ margin: text ? "6px 0 0" : 0, minHeight: text ? undefined : 0 }}
    >
      {text}
    </p>
  );
}
