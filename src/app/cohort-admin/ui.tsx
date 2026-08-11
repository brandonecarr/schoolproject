// Shared pieces of the operator console: monograms, pills, notices, the
// detail panel shell, empty states, and the small date formatters. Server
// components throughout — the one client concern (Escape closing the panel)
// lives in panel-escape.tsx.

import Link from "next/link";
import { IconX } from "./icons";
import { PanelEscape } from "@/components/panel-escape";

export type AdmTone = "good" | "info" | "warn" | "bad" | "plain";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(d: Date): string {
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function fmtMonthYear(ymd: string): string {
  const m = Number(ymd.slice(5, 7));
  return `${MONTHS_SHORT[m - 1] ?? "—"} ${ymd.slice(0, 4)}`;
}

export function relTime(d: Date, now: Date): string {
  const s = Math.max(0, (now.getTime() - d.getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/[\s.@_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "•"
  );
}

// Tinted monogram, palette cycled by a stable index so a record keeps its
// color between renders.
export function Monogram({
  name,
  index,
  round,
}: {
  name: string;
  index: number;
  round?: boolean;
}) {
  const shape = round ? "adm-mono30" : "adm-mono28";
  const tone = `adm-tone-${index % 5}`;
  const cls = `${shape} ${tone}`;
  return <span className={cls}>{initialsOf(name)}</span>;
}

export function AdmPill({
  tone,
  square,
  children,
}: {
  tone: AdmTone;
  square?: boolean;
  children: React.ReactNode;
}) {
  const cls = square ? `adm-pill adm-pill-sq adm-pill-${tone}` : `adm-pill adm-pill-${tone}`;
  return <span className={cls}>{children}</span>;
}

export function AdmNotice({ tone, children }: { tone: "good" | "warn" | "bad"; children: React.ReactNode }) {
  const cls = `adm-notice adm-notice-${tone}`;
  return <div className={cls}>{children}</div>;
}

export const LEAD_STATUS_TONE: Record<string, AdmTone> = {
  new: "warn",
  contacted: "info",
  scheduled: "info",
  won: "good",
  lost: "bad",
};

export function EmptyState({
  head,
  children,
  action,
}: {
  head: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="adm-empty">
      <div className="adm-emptytile" aria-hidden>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
      <div className="adm-emptyhead">{head}</div>
      <div className="adm-emptybody">{children}</div>
      {action}
    </div>
  );
}

// The detail panel shell: header with close, scrolling body, pinned footer.
// With onClose the close control is instant (client state); without it the
// × is a plain link to closeHref.
export function Panel({
  title,
  meta,
  closeHref,
  onClose,
  footer,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  closeHref: string;
  onClose?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <aside className="adm-panel" aria-label={title}>
      <PanelEscape closeHref={closeHref} onClose={onClose} />
      <div className="adm-panelbody">
        <div className="adm-panelhead">
          <div className="adm-paneltitle">{title}</div>
          {onClose ? (
            <button type="button" className="adm-panelclose" onClick={onClose} aria-label="Close panel">
              <IconX />
            </button>
          ) : (
            <Link className="adm-panelclose" href={closeHref} aria-label="Close panel">
              <IconX />
            </Link>
          )}
        </div>
        {meta && <div className="adm-panelmeta">{meta}</div>}
        {children}
      </div>
      {footer && <div className="adm-panelfoot">{footer}</div>}
    </aside>
  );
}
