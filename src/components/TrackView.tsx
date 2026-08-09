"use client";

// One anonymous view-count beacon per page load, public marketing pages only.
// sendBeacon so navigation away never cancels it; fetch keepalive as the
// fallback. Fire-and-forget: analytics must never be able to break a page.

import { useEffect } from "react";

export function TrackView({ path }: { path: string }) {
  useEffect(() => {
    const payload = JSON.stringify({ path, referrer: document.referrer });
    try {
      if (!navigator.sendBeacon?.("/api/beacon", new Blob([payload], { type: "application/json" }))) {
        fetch("/api/beacon", { method: "POST", body: payload, keepalive: true }).catch(() => {});
      }
    } catch {
      // Nothing: a lost count is a lost count.
    }
  }, [path]);
  return null;
}
