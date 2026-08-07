// Portfolio ordering. Pure — no Prisma, no DOM.
//
// Reordering a list is the classic off-by-one, and here it is a child's
// carefully arranged portfolio: a move that silently drops or duplicates an
// entry loses work they chose. So the rule is deliberately blunt — every move
// rewrites the whole sequence to 0..n-1, and the tests assert the set of ids is
// unchanged on every operation.

export type Orderable = { id: string; position: number };

/** Sort by position, then id so equal positions render the same way twice. */
export function ordered<T extends Orderable>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/**
 * Move one entry up or down by one place.
 *
 * Returns the full sequence with positions renumbered 0..n-1, which the caller
 * writes back. Renumbering everything rather than swapping two rows means a
 * list that has drifted (duplicate or gapped positions, which happens after
 * deletes) is repaired by the next move instead of getting worse.
 */
export function move<T extends Orderable>(items: T[], id: string, dir: "up" | "down"): T[] {
  const list = ordered(items);
  const i = list.findIndex((x) => x.id === id);
  // Unknown id, or already at the end it's being moved toward: nothing to do,
  // but still return a renumbered list so a drifted sequence gets repaired.
  if (i === -1) return renumber(list);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return renumber(list);
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return renumber(next);
}

/** Rewrite positions to 0..n-1 in current array order. */
export function renumber<T extends Orderable>(items: T[]): T[] {
  return items.map((x, i) => ({ ...x, position: i }));
}

/** Position for a newly added entry: the end of the list. */
export function nextPosition(items: Orderable[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map((x) => x.position)) + 1;
}

/**
 * A default title for a piece the student is adding, so the field is never
 * blank — they can rewrite it, but an untitled portfolio entry helps nobody.
 */
export function defaultTitle(source: { assignmentTitle?: string | null; label?: string | null }): string {
  const t = (source.assignmentTitle || source.label || "").trim();
  return t || "Untitled piece";
}

/**
 * How complete the portfolio looks, for a gentle nudge rather than a score.
 *
 * Reflections are the point, so an entry without one is counted as unfinished.
 * Deliberately not a percentage shown to the child as a grade — this is their
 * own collection, not another thing to be marked on.
 */
export function reflectionGap(entries: { reflection: string }[]): number {
  return entries.filter((e) => !e.reflection.trim()).length;
}
