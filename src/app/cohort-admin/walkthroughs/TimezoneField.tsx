"use client";

// Detects the admin's browser timezone and submits it with the availability
// window, so "9:00" means 9:00 where the founder actually lives — including
// across DST. Server-side render has no timezone; the value fills on mount.

import { useEffect, useState } from "react";

export function TimezoneField() {
  const [tz, setTz] = useState("");
  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  return (
    <>
      <input type="hidden" name="timezone" value={tz} />
      <p className="small muted" style={{ margin: "8px 0 0" }} suppressHydrationWarning>
        Times are in <span className="mono">{tz || "your timezone"}</span> — visitors see them
        converted to theirs.
      </p>
    </>
  );
}
