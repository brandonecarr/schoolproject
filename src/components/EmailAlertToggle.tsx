// The email opt-out, shown wherever a user reads their notifications.
//
// Says plainly what happens either way, because the thing people fear about
// turning email off is missing something. They won't: the in-app notification
// is always written, email is only ever an extra copy.

import { setEmailAlerts } from "@/app/(portal)/actions";

export function EmailAlertToggle({
  enabled,
  configured,
  back,
}: {
  enabled: boolean;
  configured: boolean;
  back: string;
}) {
  if (!configured) {
    return (
      <p className="small muted" style={{ marginTop: 14 }}>
        Email alerts aren&apos;t switched on for this school yet — everything shows up here instead.
      </p>
    );
  }
  return (
    <form action={setEmailAlerts} className="row" style={{ gap: 10, alignItems: "center", marginTop: 16 }}>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="on" value={enabled ? "0" : "1"} />
      <button className="btn ghost sm">{enabled ? "Turn off email alerts" : "Email me these too"}</button>
      <span className="small muted">
        {enabled
          ? "You're getting an email as well as this list."
          : "You'll only see these when you sign in."}
      </span>
    </form>
  );
}
