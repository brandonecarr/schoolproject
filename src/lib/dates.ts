// Date helpers, ported from server.js. All dates in the domain are "YYYY-MM-DD"
// strings compared lexicographically, so these all work in string space.

export const today = (): string => new Date().toISOString().slice(0, 10);

// Short human date, e.g. "Aug 4". Accepts a date-only string or ISO timestamp.
export const fmt = (d: string | null | undefined): string =>
  d
    ? new Date(d + (String(d).length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "—";

// The default billing/evidence window: the trailing 30 days.
export const periodStart = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

export const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export const daysAhead = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
