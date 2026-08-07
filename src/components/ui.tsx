// Small presentational helpers shared across pages. Server components — no
// client JS.
//
// These are the redesign's primitives. Keeping them here rather than repeating
// the markup per screen is what makes the three role styles one implementation:
// a card is the same element everywhere, and Soft vs Ledger differ only in the
// token values it reads.

import Link from "next/link";
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

// --- Redesign primitives ----------------------------------------------------

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  /** Tables and row lists manage their own padding so rows can run full-bleed
   *  to the card edge and still show a hover background. */
  pad?: boolean;
}) {
  return <div className={`card2 ${pad ? "" : "nopad"} ${className}`.trim()}>{children}</div>;
}

/** Page header: eyebrow, title, optional subline, optional right-side actions. */
export function PageHead({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="pagehead">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p className="pagesub">{sub}</p>}
      </div>
      {actions && <div className="row" style={{ gap: 10 }}>{actions}</div>}
    </header>
  );
}

/** Card header: eyebrow over a section title, with an optional link at the end. */
export function CardHead({
  eyebrow,
  title,
  href,
  linkLabel,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="cardhead">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {href && (
        <Link className="cardlink" href={href}>
          {linkLabel ?? "All"} →
        </Link>
      )}
    </div>
  );
}

/**
 * A metric card: tinted icon tile, label, big figure, and a delta line.
 *
 * The figure uses --num, which is a true monospace in Ledger — that is what
 * keeps columns of money and scores aligned across a row of these.
 */
export function StatCard({
  label,
  value,
  delta,
  tone = "info",
  glyph,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  tone?: Tone;
  glyph?: ReactNode;
}) {
  return (
    <div className="statcard">
      {glyph !== undefined && <div className={`tile ${tone}`}>{glyph}</div>}
      <div style={{ minWidth: 0 }}>
        <div className="statlabel">{label}</div>
        <div className="statvalue">{value}</div>
        {delta && <div className={`statdelta ${tone}`}>{delta}</div>}
      </div>
    </div>
  );
}

/**
 * Progress bar.
 *
 * Always rendered next to a numeral by its callers — status is never encoded
 * in colour alone, so a bar on its own is never the whole message.
 */
export function Bar({ pct, tone = "info" }: { pct: number; tone?: Tone }) {
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="bar2" role="presentation">
      <span className={`fill ${tone}`} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Stacked bar for a total split across states — the "getting paid" figure. */
export function StackBar({ parts }: { parts: { pct: number; tone: Tone | "line" }[] }) {
  return (
    <div className="stackbar" role="presentation">
      {parts.map((p, i) => (
        <span key={i} className={`seg ${p.tone}`} style={{ width: `${Math.max(0, Math.min(100, p.pct))}%` }} />
      ))}
    </div>
  );
}

/** Initials avatar, tinted with the role accent. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="avatar"
      aria-hidden
      style={{ width: size, height: size, flex: `0 0 ${size}px`, fontSize: Math.round(size * 0.4) }}
    >
      {initials}
    </span>
  );
}
