"use client";

// The blast builder. Drag a block from the palette onto the canvas (or just
// click it), edit it in place, drag blocks to reorder — and the pane on the
// right is not a mockup: it renders the SAME blocksToHtml the server sends,
// inside a sandboxed iframe, so the preview is the email.
//
// The send form carries the block list as JSON in a hidden field. The server
// re-parses it against the schema, so nothing here is trusted — this file is
// ergonomics, not enforcement.

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  blocksToHtml,
  MAX_BLOCKS,
  type Align,
  type EmailBlock,
  type BlastBrand,
} from "@/lib/email-blocks";
import { SidePanel, SideSection, SideKV } from "@/components/SidePanel";
import { useShallowParams } from "@/components/use-shallow-params";
import { parseBlocks } from "@/lib/email-blocks";
import {
  sendSchoolBlast,
  uploadBlastImage,
  saveBlastDraft,
  deleteBlastDraft,
  sendTestBlast,
} from "./actions";

type EditorBlock = { uid: number; block: EmailBlock };
type ParentRow = { id: string; name: string; reachable: boolean; studentIds: string[] };
type StudentRow = { id: string; name: string };
type DraftRow = {
  id: string;
  subject: string;
  blocksJson: string;
  audience: string;
  updatedAt: string;
};

const PALETTE: { kind: EmailBlock["kind"]; label: string; hint: string }[] = [
  { kind: "heading", label: "Heading", hint: "A section title" },
  { kind: "text", label: "Text", hint: "A paragraph" },
  { kind: "button", label: "Button", hint: "A link that stands out" },
  { kind: "image", label: "Image", hint: "From a web address" },
  { kind: "divider", label: "Divider", hint: "A thin rule" },
  { kind: "spacer", label: "Spacer", hint: "Breathing room" },
];

function fresh(kind: EmailBlock["kind"]): EmailBlock {
  switch (kind) {
    case "heading":
      return { kind, text: "" };
    case "text":
      return { kind, text: "" };
    case "button":
      return { kind, label: "", url: "" };
    case "image":
      return { kind, url: "", alt: "" };
    default:
      return { kind };
  }
}

let nextUid = 1;

export function BuilderView({
  brand,
  students,
  parents,
  drafts,
  emailReady,
}: {
  brand: BlastBrand;
  students: StudentRow[];
  parents: ParentRow[];
  drafts: DraftRow[];
  emailReady: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<EditorBlock[]>([]);
  const [subject, setSubject] = useState("");
  const [audience, setAudience] = useState<"all" | "students">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [armed, setArmed] = useState(false);
  // Draft bookkeeping: which row a save should update, and transient status.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Test send.
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  // Where a drag would land: an index into rows (insert before), or null.
  const [dropAt, setDropAt] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null); // reordering an existing block
  const dragKind = useRef<EmailBlock["kind"] | null>(null); // adding from the palette

  const blocks = rows.map((r) => r.block);
  const html = useMemo(() => blocksToHtml(blocks, brand), [rows, brand]); // eslint-disable-line react-hooks/exhaustive-deps

  const reachable = parents.filter((p) => p.reachable);
  const recipients =
    audience === "all"
      ? reachable
      : reachable.filter((p) => p.studentIds.some((s) => selected.has(s)));

  const insert = (block: EmailBlock, at: number) => {
    const uid = nextUid++;
    setRows((r) => {
      if (r.length >= MAX_BLOCKS) return r;
      const i = Math.min(at, r.length);
      return [...r.slice(0, i), { uid, block }, ...r.slice(i)];
    });
  };
  const move = (from: number, to: number) => {
    setRows((r) => {
      if (from === to || from + 1 === to) return r;
      const next = [...r];
      const [x] = next.splice(from, 1);
      next.splice(from < to ? to - 1 : to, 0, x);
      return next;
    });
  };
  const patch = (uid: number, block: EmailBlock) =>
    setRows((r) => r.map((x) => (x.uid === uid ? { ...x, block } : x)));
  const remove = (uid: number) => setRows((r) => r.filter((x) => x.uid !== uid));
  const nudge = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    setRows((r) => {
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const settle = (at: number) => {
    if (dragKind.current) insert(fresh(dragKind.current), at);
    else if (dragFrom.current !== null) move(dragFrom.current, at);
    dragKind.current = null;
    dragFrom.current = null;
    setDropAt(null);
  };

  // Shared drag-over: work out whether the pointer is in the top or bottom
  // half of block i, and mark the gap accordingly.
  const overBlock = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropAt(e.clientY < box.top + box.height / 2 ? i : i + 1);
  };

  const canSend = rows.length > 0 && recipients.length > 0 && armed;

  const audienceDescriptor = () =>
    audience === "students" ? `students:${[...selected].join(",")}` : "all";

  const saveDraft = async () => {
    if (saving) return;
    setSaving(true);
    setDraftMsg(null);
    const res = await saveBlastDraft({
      id: draftId ?? undefined,
      subject,
      blocksJson: JSON.stringify(blocks),
      audience: audienceDescriptor(),
    });
    setSaving(false);
    if ("error" in res) {
      setDraftMsg(res.error);
    } else {
      setDraftId(res.id);
      setDraftMsg("Saved — it'll be here when you come back.");
      router.refresh();
    }
  };

  const resumeDraft = (d: DraftRow) => {
    setRows(parseBlocks(d.blocksJson).map((b) => ({ uid: nextUid++, block: b })));
    setSubject(d.subject);
    setDraftId(d.id);
    if (d.audience.startsWith("students:")) {
      setAudience("students");
      setSelected(new Set(d.audience.slice("students:".length).split(",").filter(Boolean)));
    } else {
      setAudience("all");
      setSelected(new Set());
    }
    setArmed(false);
    setDraftMsg(null);
  };

  const removeDraft = async (id: string) => {
    await deleteBlastDraft(id);
    if (draftId === id) setDraftId(null);
    router.refresh();
  };

  const runTest = async () => {
    if (testing) return;
    setTesting(true);
    setTestMsg(null);
    const res = await sendTestBlast({
      to: testTo,
      subject,
      blocksJson: JSON.stringify(blocks),
    });
    setTesting(false);
    setTestMsg("error" in res ? res.error : `Test sent to ${testTo.trim()} — check that inbox.`);
  };

  return (
    <div className="blast-grid">
      <div className="blast-compose">
        <div className="card">
          <div className="blast-seclabel">Blocks</div>
          <div className="blast-palette">
            {PALETTE.map((p) => (
              <button
                key={p.kind}
                type="button"
                className="blast-chip"
                title={`${p.hint} — drag onto the email, or click to add`}
                draggable
                onDragStart={() => {
                  dragKind.current = p.kind;
                }}
                onDragEnd={() => {
                  dragKind.current = null;
                  setDropAt(null);
                }}
                onClick={() => insert(fresh(p.kind), Number.MAX_SAFE_INTEGER)}
              >
                <span className="blast-chip-grip" aria-hidden>
                  ⋮⋮
                </span>
                {p.label}
              </button>
            ))}
          </div>

          <div
            className="blast-canvas"
            onDragOver={(e) => {
              e.preventDefault();
              if (rows.length === 0) setDropAt(0);
            }}
            onDrop={(e) => {
              e.preventDefault();
              settle(dropAt ?? rows.length);
            }}
          >
            {rows.length === 0 && (
              <div className={dropAt === 0 ? "blast-empty over" : "blast-empty"}>
                Drag a block here — or click one above — to start the email.
              </div>
            )}
            {rows.map((r, i) => (
              <div key={r.uid}>
                {dropAt === i && <div className="blast-dropline" aria-hidden />}
                <div
                  className="blast-block"
                  draggable
                  onDragStart={() => {
                    dragFrom.current = i;
                  }}
                  onDragEnd={() => {
                    dragFrom.current = null;
                    setDropAt(null);
                  }}
                  onDragOver={(e) => overBlock(e, i)}
                >
                  <div className="blast-block-head">
                    <span className="blast-block-grip" aria-hidden>
                      ⋮⋮
                    </span>
                    <span className="blast-block-kind">
                      {PALETTE.find((p) => p.kind === r.block.kind)?.label}
                    </span>
                    {r.block.kind !== "divider" && r.block.kind !== "spacer" && (
                      <AlignPicker block={r.block} onChange={(b) => patch(r.uid, b)} />
                    )}
                    <span className="sp" />
                    <button
                      type="button"
                      className="blast-tool"
                      onClick={() => nudge(i, -1)}
                      disabled={i === 0}
                      aria-label="Move block up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="blast-tool"
                      onClick={() => nudge(i, 1)}
                      disabled={i === rows.length - 1}
                      aria-label="Move block down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="blast-tool"
                      onClick={() => remove(r.uid)}
                      aria-label="Remove block"
                    >
                      ✕
                    </button>
                  </div>
                  <BlockEditor block={r.block} onChange={(b) => patch(r.uid, b)} />
                </div>
              </div>
            ))}
            {dropAt === rows.length && rows.length > 0 && (
              <div className="blast-dropline" aria-hidden />
            )}
          </div>
        </div>

        <form action={sendSchoolBlast} className="card" style={{ marginTop: 12 }}>
          <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
          <input type="hidden" name="audience" value={audience} />
          {draftId && <input type="hidden" name="draftId" value={draftId} />}
          {audience === "students" &&
            [...selected].map((id) => <input key={id} type="hidden" name="students" value={id} />)}

          <label htmlFor="blast-subject">Subject line</label>
          <input
            id="blast-subject"
            name="subject"
            required
            maxLength={160}
            placeholder="Field trip forms due Friday"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <div className="blast-seclabel" style={{ marginTop: 14 }}>
            Who gets it
          </div>
          <div className="blast-aud">
            <label className="blast-aud-opt">
              <input
                type="radio"
                name="aud-pick"
                checked={audience === "all"}
                onChange={() => setAudience("all")}
              />
              All parents
            </label>
            <label className="blast-aud-opt">
              <input
                type="radio"
                name="aud-pick"
                checked={audience === "students"}
                onChange={() => setAudience("students")}
              />
              Parents of specific students
            </label>
          </div>
          {audience === "students" && (
            <div className="blast-aud-list">
              {students.length === 0 && <span className="small muted">No students yet.</span>}
              {students.map((s) => (
                <label key={s.id} className="blast-aud-student">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={(e) => {
                      setSelected((cur) => {
                        const next = new Set(cur);
                        if (e.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        return next;
                      });
                    }}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          )}

          <div className="blast-send">
            <label className="blast-arm">
              <input
                type="checkbox"
                name="confirm"
                checked={armed}
                onChange={(e) => setArmed(e.target.checked)}
              />
              Yes — send this to{" "}
              <strong>
                {recipients.length} parent{recipients.length === 1 ? "" : "s"}
              </strong>
            </label>
            <span className="sp" />
            <button className="btn mark" disabled={!canSend}>
              Send email
            </button>
          </div>
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            Goes only to parents with email alerts on. The count updates as you change the
            audience.
          </p>
        </form>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="blast-seclabel">Before you send</div>
          <div className="blast-test">
            <input
              className="blast-field blast-test-to"
              type="email"
              value={testTo}
              placeholder="you@example.com"
              aria-label="Address for a test email"
              onChange={(e) => setTestTo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runTest();
                }
              }}
            />
            <button
              type="button"
              className="btn ghost sm"
              disabled={testing || !emailReady}
              title={emailReady ? undefined : "Email delivery isn't configured here"}
              onClick={runTest}
            >
              {testing ? "Sending…" : "Send a test"}
            </button>
            <span className="sp" />
            <button type="button" className="btn ghost sm" disabled={saving} onClick={saveDraft}>
              {saving ? "Saving…" : draftId ? "Update draft" : "Save as draft"}
            </button>
          </div>
          {testMsg && <p className="blast-inline-msg">{testMsg}</p>}
          {draftMsg && <p className="blast-inline-msg">{draftMsg}</p>}
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            A test goes to that one address with a{" "}
            <strong>[Test]</strong> subject prefix — nothing is logged and no parent sees it.
            Drafts wait below until you finish them.
          </p>
        </div>

        {drafts.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="blast-seclabel">Drafts</div>
            {drafts.map((d) => (
              <div key={d.id} className={draftId === d.id ? "blast-draft open" : "blast-draft"}>
                <div className="blast-draft-main">
                  <span className="blast-row-subj">{d.subject || "Untitled"}</span>
                  <span className="blast-row-meta">
                    {parseBlocks(d.blocksJson).length} block
                    {parseBlocks(d.blocksJson).length === 1 ? "" : "s"} · saved{" "}
                    {when(d.updatedAt)}
                    {draftId === d.id ? " · editing now" : ""}
                  </span>
                </div>
                <button type="button" className="btn ghost sm" onClick={() => resumeDraft(d)}>
                  Resume
                </button>
                <button
                  type="button"
                  className="blast-tool"
                  aria-label="Delete draft"
                  title="Delete draft"
                  onClick={() => removeDraft(d.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="blast-preview card">
        <div className="blast-seclabel">Preview — exactly what parents receive</div>
        <iframe className="blast-frame" title="Email preview" sandbox="" srcDoc={html} />
      </div>
    </div>
  );
}

function BlockEditor({ block, onChange }: { block: EmailBlock; onChange: (b: EmailBlock) => void }) {
  switch (block.kind) {
    case "heading":
      return (
        <input
          className="blast-field"
          value={block.text}
          maxLength={200}
          placeholder="Heading text"
          onChange={(e) => onChange({ ...block, text: e.target.value })}
        />
      );
    case "text":
      return (
        <textarea
          className="blast-field"
          rows={3}
          value={block.text}
          maxLength={4000}
          placeholder="Write the paragraph…"
          onChange={(e) => onChange({ ...block, text: e.target.value })}
        />
      );
    case "button":
      return (
        <div className="blast-fields2">
          <input
            className="blast-field"
            value={block.label}
            maxLength={120}
            placeholder="Button label"
            onChange={(e) => onChange({ ...block, label: e.target.value })}
          />
          <input
            className="blast-field"
            value={block.url}
            maxLength={2000}
            placeholder="https://…"
            onChange={(e) => onChange({ ...block, url: e.target.value })}
          />
        </div>
      );
    case "image":
      return <ImageEditor block={block} onChange={onChange} />;
    default:
      return null;
  }
}

// --- Alignment ---------------------------------------------------------------

type Alignable = Extract<EmailBlock, { align?: Align }>;

const ALIGN_ICONS: Record<"left" | Align, React.ReactNode> = {
  left: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M3 6h18M3 12h10M3 18h14" />
    </svg>
  ),
  center: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M3 6h18M7 12h10M5 18h14" />
    </svg>
  ),
  right: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M3 6h18M11 12h10M7 18h14" />
    </svg>
  ),
};

function AlignPicker({
  block,
  onChange,
}: {
  block: Alignable;
  onChange: (b: EmailBlock) => void;
}) {
  const current: "left" | Align = block.align ?? "left";
  const set = (a: "left" | Align) => {
    // Left is the default and is stored as absence — see lib/email-blocks.
    const { align: _drop, ...rest } = block;
    void _drop;
    onChange(a === "left" ? (rest as EmailBlock) : ({ ...rest, align: a } as EmailBlock));
  };
  return (
    <span className="blast-align" role="group" aria-label="Alignment">
      {(["left", "center", "right"] as const).map((a) => (
        <button
          key={a}
          type="button"
          className={current === a ? "blast-tool on" : "blast-tool"}
          aria-pressed={current === a}
          aria-label={`Align ${a}`}
          title={`Align ${a}`}
          onClick={() => set(a)}
        >
          {ALIGN_ICONS[a]}
        </button>
      ))}
    </span>
  );
}

// --- Image upload ------------------------------------------------------------

type ImageBlock = Extract<EmailBlock, { kind: "image" }>;

/** Downscale before upload: an inbox image never needs more than ~1200px,
 *  and a phone photo is 8MB the teacher shouldn't have to think about. GIFs
 *  pass through untouched — redrawing one keeps a single frame. */
async function prepareImage(f: File): Promise<File> {
  if (f.type === "image/gif") return f;
  const bmp = await createImageBitmap(f).catch(() => null);
  if (!bmp) return f;
  const MAX_EDGE = 1200;
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && f.size <= 600 * 1024) {
    bmp.close();
    return f;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  // PNG keeps transparency; everything else re-encodes as JPEG.
  const keepPng = f.type === "image/png";
  const type = keepPng ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.85));
  if (!blob) return f;
  const name = f.name.replace(/\.[^.]*$/, "") + (keepPng ? ".png" : ".jpg");
  return new File([blob], name, { type });
}

function ImageEditor({
  block,
  onChange,
}: {
  block: ImageBlock;
  onChange: (b: EmailBlock) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f || busy) return;
    setErr(null);
    setBusy(true);
    try {
      const prepared = await prepareImage(f);
      const fd = new FormData();
      fd.set("file", prepared, prepared.name);
      const res = await uploadBlastImage(fd);
      if ("error" in res) setErr(res.error);
      else onChange({ ...block, url: res.url });
    } catch {
      setErr("Upload failed — try again.");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="blast-fields2">
      <div className="blast-upload">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="blast-upload-input"
          aria-label="Choose an image file"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <button
          type="button"
          className="btn ghost sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Uploading…" : block.url ? "Replace image" : "Upload from your computer"}
        </button>
        <span className="blast-upload-or">or paste a web address below</span>
      </div>
      {err && <span className="blast-upload-err">{err}</span>}
      <input
        className="blast-field"
        value={block.url}
        maxLength={2000}
        placeholder="Image address (https://…)"
        onChange={(e) => onChange({ ...block, url: e.target.value })}
      />
      <input
        className="blast-field"
        value={block.alt}
        maxLength={200}
        placeholder="Describe the image (for screen readers)"
        onChange={(e) => onChange({ ...block, alt: e.target.value })}
      />
    </div>
  );
}

// --- History -----------------------------------------------------------------

type BlastRow = {
  id: string;
  subject: string;
  blocksJson: string;
  audience: string;
  sentCount: number;
  sender: string;
  createdAt: string;
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function audienceLabel(a: string): string {
  if (a === "all") return "All parents";
  const n = Number(a.split(":")[1] || 0);
  return `Parents of ${n} student${n === 1 ? "" : "s"}`;
}

export function BlastHistory({ blasts, brand }: { blasts: BlastRow[]; brand: BlastBrand }) {
  const [params, update] = useShallowParams();
  const openId = params.get("blast");
  const open = blasts.find((b) => b.id === openId) ?? null;
  const close = () => update((p) => p.delete("blast"));

  return (
    <>
      <h2 style={{ marginTop: 26 }}>Sent</h2>
      {blasts.length === 0 ? (
        <p className="small muted">Nothing sent yet — your first blast will be logged here.</p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {blasts.map((b) => (
            <button
              key={b.id}
              type="button"
              className="blast-row"
              onClick={() => update((p) => p.set("blast", b.id))}
            >
              <span className="blast-row-subj">{b.subject}</span>
              <span className="blast-row-meta">
                {audienceLabel(b.audience)} · {b.sentCount} delivered · {b.sender} ·{" "}
                {when(b.createdAt)}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <SidePanel title={open.subject} onClose={close} meta={when(open.createdAt)}>
          <SideSection label="Delivery">
            <SideKV k="Audience" v={audienceLabel(open.audience)} />
            <SideKV k="Delivered" v={String(open.sentCount)} />
            <SideKV k="Sent by" v={open.sender} />
          </SideSection>
          <SideSection label="The email">
            <iframe
              className="blast-frame blast-frame-side"
              title="Sent email"
              sandbox=""
              srcDoc={blocksToHtml(parseBlocks(open.blocksJson), brand)}
            />
          </SideSection>
        </SidePanel>
      )}
    </>
  );
}
