"use client";

// URL-backed client state for the detail panels, without server round-trips.
//
// This Next version does not re-render useSearchParams() on a raw
// history.pushState, so React state is the source of truth here: updates
// mutate local state AND push the same query string to the URL, the initial
// value comes from useSearchParams (correct on SSR and hydration), and a
// popstate listener re-syncs on back/forward.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export function useShallowParams(): [URLSearchParams, (mutate: (p: URLSearchParams) => void) => void] {
  const initial = useSearchParams();
  const [params, setParams] = useState(() => new URLSearchParams(initial.toString()));

  useEffect(() => {
    const sync = () => setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const update = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(window.location.search);
    mutate(next);
    const url = new URL(window.location.href);
    url.search = next.toString();
    window.history.pushState(null, "", url.toString());
    setParams(next);
  };

  return [params, update];
}
