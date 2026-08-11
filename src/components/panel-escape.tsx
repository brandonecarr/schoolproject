"use client";

// Escape closes the detail panel, matching the × in its header. When the
// panel is client-driven (shallow URL state) closing is a callback; the
// router fallback covers any server-rendered use.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PanelEscape({
  closeHref,
  onClose,
}: {
  closeHref?: string;
  onClose?: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (onClose) onClose();
      else if (closeHref) router.push(closeHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, closeHref, onClose]);
  return null;
}
