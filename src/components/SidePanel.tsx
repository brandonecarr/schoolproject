"use client";

// The school app's slide-out detail panel — same treatment as the operator
// console (full-height floating column, equal insets, pushes the whole
// screen over) but wearing the app's own tokens. Client-only: the app's
// panels all open from client state, so close is always a callback.

import { PanelEscape } from "./panel-escape";

export function SidePanel({
  title,
  meta,
  onClose,
  footer,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <aside className="app-side" aria-label={title}>
      <PanelEscape onClose={onClose} />
      <div className="app-side-body">
        <div className="app-side-head">
          <div className="app-side-title">{title}</div>
          <button type="button" className="app-side-close" onClick={onClose} aria-label="Close panel">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {meta && <div className="app-side-meta">{meta}</div>}
        {children}
      </div>
      {footer && <div className="app-side-foot">{footer}</div>}
    </aside>
  );
}

export function SideSection({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-side-sec">
      {label && <div className="app-side-seclabel">{label}</div>}
      {children}
    </div>
  );
}

export function SideKV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="app-kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}
