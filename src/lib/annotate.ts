// Annotation geometry and ordering. Pure — no Prisma, no DOM.
//
// The whole reason this is a module rather than three inline expressions is
// that coordinates are the part that silently goes wrong. A pin stored in
// pixels, or clamped in the wrong place, lands somewhere plausible but
// incorrect, and nobody notices until a parent asks why the teacher circled
// blank paper.

/** Image types we can pin on. Anything else gets no annotation UI at all,
 *  rather than an overlay that lands in the wrong place. */
export const ANNOTATABLE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ANNOTATABLE_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

export function isAnnotatable(file: { mime?: string | null; ext?: string | null } | null): boolean {
  if (!file) return false;
  if (file.mime && ANNOTATABLE_MIME.has(file.mime.toLowerCase())) return true;
  return Boolean(file.ext && ANNOTATABLE_EXT.has(file.ext.toLowerCase()));
}

/**
 * Convert a click into a fraction of the image.
 *
 * Rejects a zero-sized box rather than dividing by it: an image that hasn't
 * laid out yet reports 0×0, and NaN coordinates would be stored happily and
 * render nowhere.
 */
export function toFraction(
  click: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number }
): { x: number; y: number } | null {
  if (!(box.width > 0) || !(box.height > 0)) return null;
  return {
    x: clamp01((click.x - box.left) / box.width),
    y: clamp01((click.y - box.top) / box.height),
  };
}

/** Keep a pin on the image. A click on the 1px border would otherwise store
 *  1.002 and render just outside the frame. */
export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export type PinLike = { id: string; x: number; y: number; createdAt?: Date | string };

/**
 * Number the pins for display.
 *
 * Ordered by creation, NOT by position: the teacher wrote them in a sequence
 * that usually follows their reasoning, and re-sorting top-to-bottom would
 * scramble a numbered explanation. Ties fall back to id so the order is stable
 * across renders (two pins can share a timestamp to the millisecond).
 */
export function numbered<T extends PinLike>(pins: T[]): (T & { n: number })[] {
  return [...pins]
    .sort(
      (a, b) =>
        String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) || a.id.localeCompare(b.id)
    )
    .map((p, i) => ({ ...p, n: i + 1 }));
}

/** CSS percentage offsets for absolute positioning. */
export function pinStyle(p: { x: number; y: number }): { left: string; top: string } {
  return { left: `${clamp01(p.x) * 100}%`, top: `${clamp01(p.y) * 100}%` };
}
