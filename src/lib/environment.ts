// Which deployment is this, and is it pointing somewhere it shouldn't be?
//
// The situation this exists for: DATABASE_URL is currently scoped to
// "Production and Preview" in Vercel, so every preview deployment — any branch,
// any pull request — reads and writes the live database. Today that only risks
// demo students. The moment a real family's records are in there, an
// in-progress branch can corrupt them, and this is COPPA-scoped data.
//
// The actual fix is to untick Preview on the database variables, which needs a
// human in the Vercel dashboard. Until someone does, the least this app can do
// is refuse to hide the fact.

export type DeploymentEnv = "production" | "preview" | "development";

export function deploymentEnv(): DeploymentEnv {
  const v = process.env.VERCEL_ENV;
  if (v === "production" || v === "preview" || v === "development") return v;
  return "development";
}

/**
 * True when a PREVIEW deployment is talking to the PRODUCTION database.
 *
 * Detected by scoping: set DB_ENVIRONMENT=production on the Production
 * environment only. If a preview build can still see that value, the variable
 * is shared across both scopes — which is exactly the same reason the database
 * URL is shared. The signal and the problem have the same cause, so one
 * variable detects the other.
 *
 * With DB_ENVIRONMENT unset this returns false rather than guessing, because a
 * banner that cries wolf gets ignored and then it is worth nothing on the day
 * it is right.
 */
export function isPreviewOnProductionDb(): boolean {
  return deploymentEnv() === "preview" && process.env.DB_ENVIRONMENT === "production";
}

/**
 * Whether this deployment may run irreversible scheduled work — the retention
 * purge, specifically, which permanently deletes student records past the
 * retention window.
 *
 * Vercel only fires crons on production, so in normal operation a preview never
 * runs one. But the endpoint is reachable by anyone holding CRON_SECRET, and
 * that secret is also shared with Preview. A preview deployment deleting real
 * children's records because someone was testing a branch is not a risk worth
 * carrying for zero benefit.
 */
export function mayRunDestructiveJobs(): { ok: true } | { ok: false; reason: string } {
  if (isPreviewOnProductionDb()) {
    return {
      ok: false,
      reason:
        "refusing to run a destructive job from a preview deployment that is pointed at the production database",
    };
  }
  return { ok: true };
}
