// Every class the app renders must have a rule in the stylesheet.
//
// WHY THIS EXISTS. A redesign commit replaced a block of globals.css that
// began with a "3) STUDENT" comment, on the assumption it held the student
// styles. That comment was the last section header in the file, so everything
// built after it across three phases sat in the same unlabelled stretch —
// 1,338 lines covering the gradebook, notification centre, markdown editor,
// work cards, worksheets, mastery board and more. Deleting it left 94 class
// names with no rules and a dozen screens rendering as unstyled text.
//
// Nothing caught it. The build compiles CSS without resolving it against
// markup, so it stayed green. The whole test suite stayed green, because
// nothing in it looked at a rendered page. Every route still returned 200 and
// every form still worked, so a route sweep proved only that the app
// functioned — which it did, unstyled. It was found by eye, four commits and
// one production deploy later.
//
// This is the check that would have caught it in seconds.
//
// It deliberately does NOT diff against a git baseline. A baseline has to be
// maintained and drifts; "used implies defined" is an invariant that needs no
// upkeep and also catches a plain typo in a class name.
//
// WHAT IT DOES NOT CATCH, stated plainly so nobody trusts it further than it
// goes. "Defined" means the class appears as a selector somewhere. A class
// whose own rule is deleted while a descendant rule survives still counts —
// deleting `.gb-grid { … }` passes while `.gb-grid th { … }` remains, and the
// grid loses its layout. Requiring each class to be the SUBJECT of some
// selector would catch that, but it also flags the nine wrapper classes here
// that legitimately exist only to scope their children, and nine standing
// allowlist entries is a worse trade than the gap. Verified by trying it.
//
// So: this catches wholesale deletion — which is what actually happened — and
// typos. It does not verify that a class is styled the way anyone intended.
// Only looking at the page does that.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

/**
 * Classes that are intentionally unstyled.
 *
 * Keep this list short and justified. An entry here is a promise that the
 * class is a semantic hook or is styled by a sibling class, not a licence to
 * silence the test.
 */
const INTENTIONALLY_UNSTYLED = new Set([
  // Always written as `className="card builder"` — .card carries the styling
  // and .builder is a hook for finding these forms.
  "builder",
]);

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === "generated" || name === "node_modules") continue;
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) tsxFiles(rel, out);
    else if (name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

/**
 * Every `className=` value in a file, as either a bare literal or an
 * expression to be scanned for string literals.
 *
 * Hand-scanned rather than regexed because the expression form nests braces —
 * `className={cond ? "a" : `b ${x}`}` — and a regex either stops at the first
 * `}` or swallows the rest of the file.
 */
function classNameValues(src: string): { literal?: string; expr?: string }[] {
  const out: { literal?: string; expr?: string }[] = [];
  const re = /className=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1);
      if (end > i) out.push({ literal: src.slice(i + 1, end) });
      continue;
    }
    if (ch !== "{") continue;
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ expr: src.slice(i + 1, j) });
  }
  return out;
}

/** String and template literals inside an expression, with `${…}` holes
 *  removed — those are runtime values, not class names. */
function literalsIn(expr: string): string[] {
  const out: string[] = [];
  for (const m of expr.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
    out.push((m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " "));
  }
  return out;
}

function collectUsed(): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();
  for (const f of tsxFiles("src")) {
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const item of classNameValues(src)) {
      const lits = item.literal !== undefined ? [item.literal] : literalsIn(item.expr!);
      for (const lit of lits) {
        for (const c of lit.split(/\s+/)) {
          // Class names only — this filters out the operators and identifiers
          // that share a template literal with them.
          if (!/^[a-z][a-z0-9-]*$/i.test(c)) continue;
          if (!used.has(c)) used.set(c, new Set());
          used.get(c)!.add(f);
        }
      }
    }
  }
  return used;
}

function collectDefined(): Set<string> {
  const raw = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
  // Comments first. This file is heavily commented and those comments mention
  // filenames and class names constantly — without stripping them, a comment
  // reading "see .gb-grid" would count as a definition and mask a real gap.
  // (Caught by this test's own dry run: it was reporting `.js` and `.tsx` as
  // defined classes, which is comment prose, not CSS.)
  const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, " ");
  // Then declaration blocks, so a property value like `url(.foo)` or a font
  // name can't masquerade as a selector.
  const selectors = noComments.replace(/\{[^{}]*\}/g, " ");
  return new Set([...selectors.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
}

const used = collectUsed();
const defined = collectDefined();

describe("the check itself is looking at something", () => {
  // A test that silently scans zero files passes forever. These are the
  // guards on the guard.
  it("finds the app's components", () => {
    expect(tsxFiles("src").length).toBeGreaterThan(50);
  });

  it("extracts a realistic number of class names from markup", () => {
    expect(used.size).toBeGreaterThan(200);
  });

  it("extracts a realistic number of rules from the stylesheet", () => {
    expect(defined.size).toBeGreaterThan(200);
  });

  it("resolves a class it knows exists", () => {
    // Sanity: if the extractor broke, this fails before the real assertion
    // reports a misleading all-clear.
    expect(used.has("card")).toBe(true);
    expect(defined.has("card")).toBe(true);
  });
});

describe("every rendered class has a rule", () => {
  it("has no class used in markup that the stylesheet does not define", () => {
    const missing = [...used.keys()]
      .filter((c) => !defined.has(c) && !INTENTIONALLY_UNSTYLED.has(c))
      .sort()
      .map((c) => `.${c} — used in ${[...used.get(c)!].slice(0, 3).join(", ")}`);
    expect(missing, `\n${missing.join("\n")}\n`).toEqual([]);
  });

  it("keeps the allowlist honest", () => {
    // An entry that has since been given a rule, or is no longer used at all,
    // should leave — otherwise the list grows into a place things go to hide.
    for (const c of INTENTIONALLY_UNSTYLED) {
      expect(used.has(c), `.${c} is allowlisted but no longer used — drop it`).toBe(true);
      expect(defined.has(c), `.${c} is allowlisted but now has a rule — drop it`).toBe(false);
    }
  });
});
