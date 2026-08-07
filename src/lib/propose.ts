// Turn a model's field-level claims into a concrete edit to src/lib/rules.ts.
//
// THE MODEL NEVER WRITES CODE. It returns claims of the shape
// {field, before, after, quote}, constrained to the whitelist below, and this
// file mechanically produces the replacement line. That boundary is the main
// safety property of the whole watcher: the content being interpreted comes
// from the public internet, so a defaced or hostile page must not be able to
// reach the repository. The worst a compromised page can do here is propose a
// wrong NUMBER in a whitelisted field, which a human then sees in a diff — it
// cannot introduce a new field, a new key, or a line of executable code.
//
// Everything in this file is pure so the generated patch is testable without a
// model, a network, or a database.

/**
 * The only fields a proposal may touch. Adding to this list widens what an
 * untrusted web page can influence, so each entry needs to be worth it.
 * Deliberately absent: `rail` (changing an administrator is high-severity and
 * belongs in a human's hands from the start) and anything structural.
 */
export const PATCHABLE = ["amount", "label", "program", "kind", "live", "limited"] as const;
export type PatchableField = (typeof PATCHABLE)[number];

export type ProposedChange = {
  field: PatchableField | "rail" | "requirements" | "eligibility" | "deadline" | "other";
  before: string;
  after: string;
  /** Verbatim from the page. A claim without evidence is not reviewable. */
  quote: string;
};

export function isPatchable(f: ProposedChange["field"]): f is PatchableField {
  return (PATCHABLE as readonly string[]).includes(f);
}

/** Render a value as the TypeScript literal that belongs in rules.ts. */
function literal(field: PatchableField, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (field === "amount") {
    // Accept "$7,600", "7600", "7,600 per year" — take the first number, but
    // keep any sign attached to it. Matching bare digits turned "-500" into
    // 500, which sailed past the positivity check below.
    const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const n = Math.round(Number(m[0]));
    if (!Number.isFinite(n) || n <= 0 || n >= 100_000) return null;
    return String(n);
  }
  if (field === "live") {
    if (/^(true|yes|live|active|disbursing)$/i.test(v)) return "true";
    if (/^(false|no|not live|pending|not yet)$/i.test(v)) return "false";
    return null;
  }
  if (field === "kind") {
    return ["esa", "taxcredit", "voucher", "allotment"].includes(v.toLowerCase())
      ? `"${v.toLowerCase()}"`
      : null;
  }
  // String fields. Escape so a page cannot break out of the literal — the model
  // is not trusted to have sanitised anything.
  const safe = v
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 200);
  return `"${safe}"`;
}

export type PatchResult = {
  /** The unified-diff-ish text a reviewer reads. Empty when nothing is patchable. */
  patch: string;
  /** Field changes that produced an edit. */
  applied: ProposedChange[];
  /** Field changes we deliberately did not automate, with the reason. */
  manual: { change: ProposedChange; reason: string }[];
};

/**
 * Build the edit for one PROGRAMS entry.
 *
 * `line` is the existing source line for that state, passed in by the caller so
 * this stays pure — the caller reads rules.ts, this decides what it should say.
 */
export function patchProgramLine(
  state: string,
  line: string,
  changes: ProposedChange[]
): PatchResult {
  const applied: ProposedChange[] = [];
  const manual: { change: ProposedChange; reason: string }[] = [];
  let next = line;

  for (const c of changes) {
    if (!isPatchable(c.field)) {
      manual.push({
        change: c,
        reason:
          c.field === "rail"
            ? "Changing the administrator is the highest-severity edit there is — a wrong rail is an instant rejection. Never automated."
            : "Not a scalar field on PROGRAMS; needs a human to decide where it belongs.",
      });
      continue;
    }
    if (!c.quote.trim()) {
      manual.push({ change: c, reason: "No supporting quote from the page — unverifiable claim, dropped." });
      continue;
    }
    const lit = literal(c.field, c.after);
    if (lit === null) {
      manual.push({ change: c, reason: `Could not read "${c.after}" as a valid ${c.field} value.` });
      continue;
    }
    // Replace `field: <anything up to the next comma or brace>` inside the line.
    const re = new RegExp(`(\\b${c.field}:\\s*)("(?:[^"\\\\]|\\\\.)*"|[^,}]+)`);
    if (!re.test(next)) {
      manual.push({ change: c, reason: `Field \`${c.field}\` not present on the ${state} entry.` });
      continue;
    }
    const updated = next.replace(re, (_m, prefix) => `${prefix}${lit}`);
    if (updated === next) {
      manual.push({ change: c, reason: "Value already matches — nothing to change." });
      continue;
    }
    next = updated;
    applied.push(c);
  }

  const patch =
    applied.length === 0
      ? ""
      : ["--- a/src/lib/rules.ts", "+++ b/src/lib/rules.ts", `-${line.trimEnd()}`, `+${next.trimEnd()}`].join("\n");

  return { patch, applied, manual };
}

/**
 * The PR description. Written to be reviewable in under a minute: what changed,
 * what the page actually says, and — prominently — what the reviewer still has
 * to do by hand.
 */
export function proposalBody(input: {
  sourceLabel: string;
  url: string;
  summary: string;
  confidence: string;
  applied: ProposedChange[];
  manual: { change: ProposedChange; reason: string }[];
  magnitude: number;
  model: string;
}): string {
  const lines: string[] = [];
  lines.push(`**${input.summary}**`, "");
  lines.push(
    `Detected on [${input.sourceLabel}](${input.url}) — about ${Math.round(input.magnitude * 100)}% of the page text changed.`,
    ""
  );

  if (input.applied.length) {
    lines.push("### Proposed edits", "");
    lines.push("| Field | From | To |", "| --- | --- | --- |");
    for (const c of input.applied) {
      lines.push(`| \`${c.field}\` | ${md(c.before)} | ${md(c.after)} |`);
    }
    lines.push("", "### Evidence", "");
    for (const c of input.applied) lines.push(`- \`${c.field}\` — > ${md(c.quote)}`);
    lines.push("");
  }

  if (input.manual.length) {
    lines.push("### Not automated — decide these yourself", "");
    for (const { change, reason } of input.manual) {
      lines.push(`- **${change.field}**: ${md(change.before)} → ${md(change.after)}`);
      lines.push(`  - ${reason}`);
      if (change.quote.trim()) lines.push(`  - > ${md(change.quote)}`);
    }
    lines.push("");
  }

  lines.push("---", "");
  lines.push(
    `Drafted by \`${input.model}\` at **${input.confidence}** confidence from a diff of the page above.`,
    "",
    "**Read the source before merging.** This was written by a model from a public web page, which is",
    "untrusted input — the quotes above are there so you can check them against the live page rather",
    "than take the summary on faith. The ⚑ `verify` flag stays set either way: a webpage is not an",
    "invoice cycle, and only a real payment retires that flag.",
    ""
  );
  return lines.join("\n");
}

/** Escape pipe and newline so a hostile page can't break the markdown table. */
function md(s: string): string {
  return s.replace(/[|\r\n]+/g, " ").trim().slice(0, 300) || "—";
}

export function branchName(sourceId: string, snapshotId: string): string {
  const slug = sourceId.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `rules/${slug}-${snapshotId.slice(-8)}`;
}
