"use client";

// Instant feedback for EVERY form in the app.
//
// Almost every button posts to a server action and then waits for the server
// to answer — and until it did, nothing on screen changed. On a slow round
// trip that reads as "did my click even register?", which is worse than the
// wait itself. This component listens (once, at the document) for any form
// submission and marks the clicked button busy — CSS shows a spinner beside
// its label and blocks a second click. Every action ends in a redirect, so a
// completed navigation clears the markers; a timeout catches the rare
// action that errors without navigating.
//
// Forms that manage their own optimistic state (the Annotator's pin form)
// opt out with data-instant — they respond immediately by themselves.

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function clearBusy() {
  document.querySelectorAll("[data-busy]").forEach((el) => {
    el.removeAttribute("data-busy");
    el.removeAttribute("aria-busy");
  });
}

function Listener() {
  const pathname = usePathname();
  const search = useSearchParams();

  // A completed navigation — which is how every server action ends — resets
  // the world.
  useEffect(() => {
    clearBusy();
  }, [pathname, search]);

  useEffect(() => {
    const onSubmit = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.hasAttribute("data-instant")) return;
      const submitter =
        (e as SubmitEvent).submitter ??
        form.querySelector('button:not([type="button"]), input[type="submit"]');
      if (!(submitter instanceof HTMLElement)) return;
      submitter.setAttribute("data-busy", "1");
      submitter.setAttribute("aria-busy", "true");
      // Safety valve: an action that throws never navigates, and the marker
      // must not outlive the failure.
      window.setTimeout(() => {
        submitter.removeAttribute("data-busy");
        submitter.removeAttribute("aria-busy");
      }, 20000);
    };
    // Capture phase: React's own action plumbing calls preventDefault on
    // these submissions, and the marker has to land regardless.
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  return null;
}

export function PendingFeedback() {
  // useSearchParams needs a Suspense boundary so static pages stay static.
  return (
    <Suspense fallback={null}>
      <Listener />
    </Suspense>
  );
}
