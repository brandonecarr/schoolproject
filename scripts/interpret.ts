// Run the Tier-2 interpreter by hand: `npm run interpret`
//
// By default it only stores proposals. Pass --pr to also open pull requests,
// which needs GITHUB_TOKEN and GITHUB_REPO. That flag is opt-in every run
// because it writes to a repository, and a cron that silently opens PRs is a
// surprise nobody wants twice.
//
//   npm run interpret                 interpret everything pending
//   npm run interpret -- az-esa       one source
//   npm run interpret -- --pr         and open PRs

import "dotenv/config";
import { runInterpretation } from "../src/lib/interpret-run";

async function main() {
  const argv = process.argv.slice(2);
  const openPr = argv.includes("--pr");
  const only = argv.filter((a) => !a.startsWith("-"));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("ANTHROPIC_API_KEY is not set — nothing can be interpreted.");
    console.log("Pending sources stay flagged, which is correct: unread is not the same as unchanged.\n");
  }

  const r = await runInterpretation({ openPr, only: only.length ? only : undefined });

  for (const x of r.results) {
    const mark = x.outcome === "interpreted" ? (x.material ? "!!" : " =") : " ?";
    console.log(`${mark}  ${x.sourceId.padEnd(22)} ${x.outcome}${x.material ? "  MATERIAL" : ""}`);
    if (x.summary) console.log(`    ${x.summary}`);
    if (x.patched) console.log(`    ${x.patched} field(s) patched, ${x.manual} left for a human`);
    if (x.prUrl) console.log(`    PR: ${x.prUrl}`);
    if (x.prError) console.log(`    PR not opened: ${x.prError}`);
    if (x.error) console.log(`    error: ${x.error}`);
  }

  console.log(
    `\n${r.pending} pending · ${r.interpreted} interpreted · ${r.material} material · ${r.prsOpened} PRs opened`
  );
  process.exit(0);
}

main();
