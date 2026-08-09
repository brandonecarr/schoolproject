"use client";

// Escape closes the detail panel, matching the × in its header. The panel is
// URL-backed, so "close" is just navigating to the list without the param.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PanelEscape({ closeHref }: { closeHref: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, closeHref]);
  return null;
}
