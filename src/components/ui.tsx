// Small presentational helpers shared across pages. Server components — no
// client JS. These mirror the inline markup patterns from the MVP's views.

import type { ReactNode } from "react";

export type Tone = "good" | "warn" | "bad" | "info";

export function Pill({
  tone,
  children,
  title,
}: {
  tone: Tone | "mark";
  children: ReactNode;
  /** Hover explanation. Used by the verification chip, where the label is terse
   *  ("Observed 2/5") and the reason behind it is worth a tooltip. */
  title?: string;
}) {
  return (
    <span className={`pill ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <div className={`notice ${tone}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

// A ⚑ warning for unverified rules/figures. Never remove the flag until a real
// invoice cycle has been observed (COHORT-HANDOFF §4.5).
export function VerifyFlag({ children }: { children: ReactNode }) {
  return (
    <div className="verifyflag" style={{ marginTop: 8 }}>
      ⚑ {children}
    </div>
  );
}
