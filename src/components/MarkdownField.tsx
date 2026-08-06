"use client";

// A textarea with a small formatting toolbar and a preview toggle.
//
// The buttons only insert markdown characters around the selection — there is
// no rich-text document model, no contenteditable, and no external editor
// dependency. What the teacher types is exactly what gets stored, which keeps
// the storage format inspectable and the security model simple.

import { useRef, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";

type Wrap = { before: string; after?: string; block?: boolean; placeholder: string };

const TOOLS: { key: string; label: string; title: string; wrap: Wrap }[] = [
  { key: "b", label: "B", title: "Bold", wrap: { before: "**", after: "**", placeholder: "bold text" } },
  { key: "i", label: "I", title: "Italic", wrap: { before: "*", after: "*", placeholder: "italic text" } },
  { key: "h", label: "H", title: "Heading", wrap: { before: "## ", block: true, placeholder: "Heading" } },
  { key: "ul", label: "•", title: "Bulleted list", wrap: { before: "- ", block: true, placeholder: "item" } },
  { key: "ol", label: "1.", title: "Numbered list", wrap: { before: "1. ", block: true, placeholder: "item" } },
  { key: "quote", label: "❝", title: "Quote", wrap: { before: "> ", block: true, placeholder: "quote" } },
  { key: "code", label: "‹›", title: "Code", wrap: { before: "`", after: "`", placeholder: "code" } },
  {
    key: "link",
    label: "🔗",
    title: "Link",
    wrap: { before: "[", after: "](https://)", placeholder: "link text" },
  },
];

export function MarkdownField({
  name,
  id,
  defaultValue = "",
  placeholder,
  rows = 6,
  label,
  hint,
}: {
  name: string;
  id?: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  label?: string;
  hint?: string;
}) {
  const fieldId = id ?? name;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [preview, setPreview] = useState(false);

  const apply = (w: Wrap) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const body = selected || w.placeholder;

    let next: string;
    let caretStart: number;
    let caretEnd: number;

    if (w.block) {
      // Put the marker at the start of the line the caret sits on.
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      next = value.slice(0, lineStart) + w.before + value.slice(lineStart);
      caretStart = start + w.before.length;
      caretEnd = end + w.before.length;
    } else {
      next = value.slice(0, start) + w.before + body + (w.after ?? "") + value.slice(end);
      caretStart = start + w.before.length;
      caretEnd = caretStart + body.length;
    }

    setValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caretStart, caretEnd);
    });
  };

  return (
    <div className="mdfield">
      {label && <label htmlFor={fieldId}>{label}</label>}
      <div className="mdbar">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            className="mdbtn"
            title={t.title}
            aria-label={t.title}
            onClick={() => apply(t.wrap)}
            disabled={preview}
          >
            {t.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className={`mdbtn ${preview ? "on" : ""}`}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? "Write" : "Preview"}
        </button>
      </div>

      {preview ? (
        <div
          className="md mdpreview"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || "<p class='muted'>Nothing to preview yet.</p>" }}
        />
      ) : (
        <textarea
          id={fieldId}
          ref={ref}
          name={name}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      {/* Keep the value posted even while the preview is showing. */}
      {preview && <input type="hidden" name={name} value={value} />}
      <p className="small muted mdhint">
        {hint ?? "Formatting: **bold**, *italic*, ## heading, - list, > quote, [link](https://…)"}
      </p>
    </div>
  );
}
