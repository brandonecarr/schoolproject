// One-time token helpers for invite + password-reset links. Link-based so there
// is no email dependency — the teacher/owner shares the generated URL directly.

import { newSessionId } from "@/lib/password";

export const newTokenValue = (): string => newSessionId();

export const tokenExpiry = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString();

/** For the signup handoff, which is a redirect the browser follows
 *  immediately. Minutes, not days — nothing legitimate takes longer. */
export const tokenExpiryMinutes = (minutes: number): string =>
  new Date(Date.now() + minutes * 60_000).toISOString();

export const tokenUsable = (t: { usedAt: string | null; expiresAt: string }): boolean =>
  !t.usedAt && Date.parse(t.expiresAt) > Date.now();
