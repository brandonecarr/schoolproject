// A strip across the top of every page when a preview deployment is reading and
// writing the production database.
//
// Deliberately ugly and unmissable. The failure it guards against is quiet: you
// open a branch preview to check a change, edit something to see if it works,
// and only later realise it was a real school's record. There is no undo for
// that, so the warning has to arrive before the edit rather than after.

import { isPreviewOnProductionDb } from "@/lib/environment";

export function EnvBanner() {
  if (!isPreviewOnProductionDb()) return null;
  return (
    <div className="envbanner" role="alert">
      <strong>Preview deployment — live production database.</strong> Anything you change here
      changes real records. Untick <code>Preview</code> on <code>DATABASE_URL</code> and{" "}
      <code>DIRECT_URL</code> in Vercel to separate them.
    </div>
  );
}
