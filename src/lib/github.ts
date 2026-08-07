// Open a pull request with a proposed rules.ts edit.
//
// Fails closed: with no GITHUB_TOKEN the proposal is still stored and visible in
// /proposals, it just doesn't become a PR. That ordering is deliberate — the
// review surface must work without granting a serverless cron write access to
// the repository, so adopting the automation is a separate, explicit decision.
//
// Uses the REST API rather than a git binary: serverless has no git, and the
// contents API can create a branch and commit a single file in three calls.

const API = "https://api.github.com";

type Ok = { ok: true; url: string };
type Err = { ok: false; error: string };

function repo(): { owner: string; name: string; base: string } | null {
  // e.g. GITHUB_REPO="brandonecarr/schoolproject"
  const slug = process.env.GITHUB_REPO;
  if (!slug || !slug.includes("/")) return null;
  const [owner, name] = slug.split("/");
  return { owner, name, base: process.env.GITHUB_BASE_BRANCH || "main" };
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function prConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && repo());
}

/**
 * Read src/lib/rules.ts as it exists on the base branch right now.
 *
 * Preferred over reading the file from disk, for two reasons. The deployed
 * bundle's copy is whatever was built, so it can be older than main and produce
 * a patch against a line that no longer exists — openRulesPr would then refuse
 * it, correctly but confusingly. And relying on a source file being present at
 * a runtime path in a serverless bundle depends on Next's file tracing, which
 * happens to include it today and is not a contract.
 *
 * Returns null when GitHub isn't configured or reachable; the caller falls back
 * to the local file, which is what `npm run interpret` uses in development.
 */
export async function fetchRulesSource(): Promise<string | null> {
  const r = repo();
  if (!process.env.GITHUB_TOKEN || !r) return null;
  try {
    const res = await gh(`/repos/${r.owner}/${r.name}/contents/src/lib/rules.ts?ref=${r.base}`);
    if (!res.ok) return null;
    const file = (await res.json()) as { content?: string };
    if (!file.content) return null;
    return Buffer.from(file.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Create a branch off base, replace one line of src/lib/rules.ts, and open a PR.
 *
 * `expectedLine` is the exact line we generated the patch against. If the file
 * has moved on since, we refuse rather than guess — a stale patch applied to a
 * shifted file is how you silently change the wrong state's award.
 */
export async function openRulesPr(input: {
  branch: string;
  title: string;
  body: string;
  expectedLine: string;
  newLine: string;
}): Promise<Ok | Err> {
  const r = repo();
  if (!process.env.GITHUB_TOKEN || !r) return { ok: false, error: "GITHUB_TOKEN / GITHUB_REPO not configured" };
  const path = "src/lib/rules.ts";

  try {
    // 1. Tip of base.
    const refRes = await gh(`/repos/${r.owner}/${r.name}/git/ref/heads/${r.base}`);
    if (!refRes.ok) return { ok: false, error: `read base ref: HTTP ${refRes.status}` };
    const baseSha = ((await refRes.json()) as { object: { sha: string } }).object.sha;

    // 2. Current file.
    const fileRes = await gh(`/repos/${r.owner}/${r.name}/contents/${path}?ref=${r.base}`);
    if (!fileRes.ok) return { ok: false, error: `read ${path}: HTTP ${fileRes.status}` };
    const file = (await fileRes.json()) as { content: string; sha: string };
    const current = Buffer.from(file.content, "base64").toString("utf8");

    // 3. Apply, but only if the file still says what we think it says.
    const occurrences = current.split(input.expectedLine).length - 1;
    if (occurrences !== 1) {
      return {
        ok: false,
        error:
          occurrences === 0
            ? "the line this patch was written against is no longer in rules.ts (already fixed?)"
            : `the line appears ${occurrences} times — too ambiguous to patch safely`,
      };
    }
    const updated = current.replace(input.expectedLine, input.newLine);

    // 4. Branch, commit, PR.
    const branchRes = await gh(`/repos/${r.owner}/${r.name}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: baseSha }),
    });
    // 422 = branch already exists, which is fine on a retry.
    if (!branchRes.ok && branchRes.status !== 422) {
      return { ok: false, error: `create branch: HTTP ${branchRes.status}` };
    }

    const commitRes = await gh(`/repos/${r.owner}/${r.name}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message: input.title,
        content: Buffer.from(updated, "utf8").toString("base64"),
        sha: file.sha,
        branch: input.branch,
      }),
    });
    if (!commitRes.ok) return { ok: false, error: `commit: HTTP ${commitRes.status}` };

    const prRes = await gh(`/repos/${r.owner}/${r.name}/pulls`, {
      method: "POST",
      body: JSON.stringify({ title: input.title, body: input.body, head: input.branch, base: r.base }),
    });
    if (!prRes.ok) return { ok: false, error: `open pr: HTTP ${prRes.status}` };
    const pr = (await prRes.json()) as { html_url: string };
    return { ok: true, url: pr.html_url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
