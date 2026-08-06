// Module sequencing — what a given student can open right now, and why not.
//
// Pure functions (no prisma) so the locking rules are unit-testable. Three
// independent gates, checked in this order:
//
//   1. unlockAt   — the module isn't available before a date
//   2. prereq     — an earlier module must be complete first
//   3. sequential — within a module, required items open one at a time
//
// Completion is DERIVED wherever a record already exists: an assignment item is
// complete because its submission is graded (and meets minScore, if set), not
// because something wrote a duplicate progress row. Only pages — which have no
// other trace of being read — record progress explicitly. That way the two can
// never drift out of sync.

export type ItemKind = "page" | "assignment" | "header";

export type ModuleLike = {
  id: string;
  name: string;
  description: string;
  position: number;
  published: boolean;
  unlockAt: string; // YYYY-MM-DD, "" = now
  requireSequential: boolean;
  prereqModuleId: string | null;
  courseId: string | null;
};

export type ItemLike = {
  id: string;
  moduleId: string;
  kind: string;
  refId: string;
  title: string;
  position: number;
  required: boolean;
  minScore: number | null;
};

// What we know about the student's work, passed in from the caller.
export type SubmissionLike = {
  assignmentId: string;
  status: string;
  score: number | null;
};

export type ItemState = {
  item: ItemLike;
  complete: boolean;
  locked: boolean;
  lockReason: string;
};

export type ModuleState = {
  module: ModuleLike;
  items: ItemState[];
  locked: boolean;
  lockReason: string;
  requiredTotal: number;
  requiredDone: number;
  complete: boolean;
  pct: number;
};

// Is one item done?
export function itemComplete(
  item: ItemLike,
  submissions: SubmissionLike[],
  pageDoneIds: Set<string>
): boolean {
  if (item.kind === "header") return true; // nothing to do
  if (item.kind === "page") return pageDoneIds.has(item.id);
  const sub = submissions.find((s) => s.assignmentId === item.refId);
  if (!sub || sub.status !== "graded") return false;
  if (item.minScore == null) return true;
  return (sub.score ?? 0) >= item.minScore;
}

export function buildModuleStates({
  modules,
  items,
  submissions,
  pageDoneIds,
  today,
  isTeacher = false,
}: {
  modules: ModuleLike[];
  items: ItemLike[];
  submissions: SubmissionLike[];
  pageDoneIds: Set<string>;
  today: string;
  isTeacher?: boolean;
}): ModuleState[] {
  const ordered = [...modules].sort((a, b) => a.position - b.position);

  // First pass: completion, ignoring locks (a lock never changes what's done).
  const completionById = new Map<string, boolean>();
  const statesById = new Map<string, ModuleState>();

  for (const m of ordered) {
    const mine = items
      .filter((i) => i.moduleId === m.id)
      .sort((a, b) => a.position - b.position);
    const itemStates: ItemState[] = mine.map((item) => ({
      item,
      complete: itemComplete(item, submissions, pageDoneIds),
      locked: false,
      lockReason: "",
    }));
    const required = itemStates.filter((s) => s.item.required && s.item.kind !== "header");
    const requiredDone = required.filter((s) => s.complete).length;
    const complete = required.length > 0 && requiredDone === required.length;
    completionById.set(m.id, complete);
    statesById.set(m.id, {
      module: m,
      items: itemStates,
      locked: false,
      lockReason: "",
      requiredTotal: required.length,
      requiredDone,
      complete,
      pct: required.length ? Math.round((requiredDone / required.length) * 100) : 0,
    });
  }

  // Second pass: locks. Teachers see everything unlocked — they're authoring it.
  for (const m of ordered) {
    const st = statesById.get(m.id)!;
    if (isTeacher) continue;

    if (m.unlockAt && m.unlockAt > today) {
      st.locked = true;
      st.lockReason = `Opens ${m.unlockAt}`;
    } else if (m.prereqModuleId) {
      const prereq = statesById.get(m.prereqModuleId);
      if (prereq && !prereq.complete) {
        st.locked = true;
        st.lockReason = `Finish “${prereq.module.name}” first`;
      }
    }

    if (st.locked) {
      for (const is of st.items) {
        is.locked = true;
        is.lockReason = st.lockReason;
      }
      continue;
    }

    // Sequential: the first incomplete required item is open; later ones wait.
    if (m.requireSequential) {
      let blocked = false;
      for (const is of st.items) {
        if (is.item.kind === "header") continue;
        if (blocked) {
          is.locked = true;
          is.lockReason = "Finish the item above first";
          continue;
        }
        if (is.item.required && !is.complete) blocked = true; // this one is open; the rest wait
      }
    }
  }

  return ordered.map((m) => statesById.get(m.id)!);
}

// Overall progress across published modules — used on dashboards.
export function overallProgress(states: ModuleState[]): {
  done: number;
  total: number;
  pct: number;
} {
  const total = states.reduce((n, s) => n + s.requiredTotal, 0);
  const done = states.reduce((n, s) => n + s.requiredDone, 0);
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export const KIND_ICON: Record<string, string> = {
  page: "▤",
  assignment: "✎",
  header: "§",
};
