// The one pure piece of lib/due.ts, split out so client components can
// phrase due dates without dragging the Prisma-backed query module (and its
// next/headers chain) into the browser bundle.

export function dueLabel(daysLeft: number): string {
  if (daysLeft < 0) return daysLeft === -1 ? "1 day overdue" : `${-daysLeft} days overdue`;
  if (daysLeft === 0) return "Due today";
  if (daysLeft === 1) return "Due tomorrow";
  return `Due in ${daysLeft} days`;
}
