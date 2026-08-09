"use client";

// Renders a UTC instant in the viewer's own timezone. The server cannot know
// that timezone, so it renders the UTC form and the client corrects it —
// suppressHydrationWarning because that correction is the entire point.

export function LocalTime({ iso, mode = "full" }: { iso: string; mode?: "full" | "time" }) {
  const d = new Date(iso);
  const text =
    mode === "time"
      ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : d.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
  return <span suppressHydrationWarning>{text}</span>;
}
