// Shown across the top of every portal page while a staff member is viewing as
// a family member.
//
// Deliberately impossible to miss, and deliberately worded to remove doubt
// about two things: whose account this is, and that nothing here can be
// changed. The failure this prevents is a teacher forgetting they're in
// someone else's view and being confused about why a button did nothing — or
// worse, believing they submitted something on a family's behalf.

import { stopViewAs } from "@/app/view-as/actions";

export function ViewAsBanner({ name, role }: { name: string; role: string }) {
  return (
    <div className="viewasbar" role="status">
      <span>
        Viewing as <strong>{name}</strong> ({role}) — read-only. Nothing you do here will save.
      </span>
      <form action={stopViewAs}>
        <button type="submit" className="viewasbtn">
          Back to my account
        </button>
      </form>
    </div>
  );
}
