// Run the Tier-1 source sweep by hand: `npm run watch`
//
// Same code path the daily cron uses, minus the HTTP layer. Mostly useful for
// validating src/lib/sources.ts — a registry of URLs is only as good as its
// last check, and a 404 here is a source that would otherwise fail silently.
//
// `npm run watch -- az-esa ia-esa` checks a subset.

import "dotenv/config";
import { runSweep } from "../src/lib/watch-run";
import { SOURCES } from "../src/lib/sources";

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const report = await runSweep(only.length ? only : undefined);

  for (const r of report.results) {
    const mark = r.status === "ok" ? (r.changed ? (r.escalated ? "!!" : " ~") : " =") : "XX";
    const note =
      r.status !== "ok"
        ? `${r.status} ${r.error ?? ""}`
        : r.changed
          ? `changed  Δ${r.delta >= 0 ? "+" : ""}${r.delta}  mag ${r.magnitude.toFixed(3)}${r.escalated ? "  ESCALATED" : ""}`
          : `unchanged (${r.textLength} chars)`;
    console.log(`${mark}  ${pad(r.sourceId, 22)} ${note}`);
  }

  console.log(
    `\n${report.checked} checked · ${report.ok} ok · ${report.changed} changed · ${report.escalated} escalated · ${report.failed} failed`
  );

  if (report.failed) {
    console.log("\nFailing sources — fix or remove these in src/lib/sources.ts:");
    for (const r of report.results.filter((x) => x.status !== "ok")) {
      const src = SOURCES.find((s) => s.id === r.sourceId);
      console.log(`  ${pad(r.sourceId, 22)} ${r.status.padEnd(12)} ${src?.url}`);
      if (r.error) console.log(`  ${" ".repeat(22)} ${r.error}`);
    }
  }
  process.exit(0);
}

main();
