// The two rows EVERY request resolves before it can do anything: the session
// named by the cookie, and the user the session names. Both getSession()
// (who is signed in) and resolveRequestTenant() (which school scopes RLS)
// need them, and each used to fetch its own copies — four sequential system
// queries per request where two suffice. With row-level security wrapping
// every query in its own transaction, that duplication alone was ~a third
// of a second on every single navigation.
//
// cache() memoises per request: whichever caller runs first pays, the other
// reads for free. Reads go through prismaSystem because this IS the
// authentication step — nothing is scoped until it answers who is asking.

import { cache } from "react";
import { prismaSystem } from "@/lib/db";

export const sessionRowFor = cache(async (sid: string) =>
  prismaSystem.session.findUnique({ where: { id: sid } })
);

export const userRowFor = cache(async (userId: string) =>
  prismaSystem.user.findUnique({ where: { id: userId } })
);
