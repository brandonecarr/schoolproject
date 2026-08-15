"use client";

// The school's web address, chosen once.
//
// A client component for one reason: it fills itself in from the school name
// as you type, and stops the moment you edit it yourself. Without that, almost
// nobody would fill it in thoughtfully — and this is the one field on the form
// that cannot be changed afterwards, because it is in every link the school
// will ever send a family.
//
// The derivation here MIRRORS slugify() in lib/tenant.ts and does not replace
// it. This one exists so the field isn't empty; the server re-derives,
// validates and settles collisions against the unique index. If the two ever
// disagree, the server wins and the person sees an error, which is the right
// failure: the alternative is trusting a value the browser sent.

import { useEffect, useRef, useState } from "react";

/** Same shape as lib/tenant.ts slugify, minus the length floor — a partially
 *  typed name should show its partial address rather than blank out. */
function preview(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 63);
}

export function SlugField({
  root,
  label = "Your school's web address",
  help = "Where you and your families sign in. Permanent — keep it short.",
  placeholder = "cedar-grove",
}: {
  root: string;
  label?: string;
  help?: string;
  placeholder?: string;
}) {
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Listens on the whole form rather than lifting the school name into state.
  // The name input stays uncontrolled, and so does every other field, which is
  // what lets this form submit through a plain server action with no client
  // JavaScript running at all — the server derives the address from the name
  // when this field arrives empty.
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const onInput = (e: Event) => {
      const target = e.target as HTMLInputElement | null;
      if (target?.name !== "schoolName") return;
      setSlug((current) => (touched ? current : preview(target.value)));
    };
    form.addEventListener("input", onInput);
    return () => form.removeEventListener("input", onInput);
  }, [touched]);

  return (
    <div ref={box}>
      <label htmlFor="slug">{label}</label>
      <div className="su-slug">
        <input
          id="slug"
          name="slug"
          value={slug}
          onChange={(e) => {
            setTouched(true);
            setSlug(preview(e.target.value));
          }}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-describedby="slughelp"
        />
        <span className="su-root">.{root || "your-domain"}</span>
      </div>
      <p className="small muted" id="slughelp" style={{ margin: "6px 0 0" }}>
        {help}
      </p>
    </div>
  );
}
