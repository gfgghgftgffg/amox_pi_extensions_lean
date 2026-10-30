import { readFileSync, statSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { git } from "./local-checks.mjs";
import { failureExcerpt } from "./local-sandbox.mjs";
import { HEX40 } from "./files.mjs";
import { RemoteHttpError } from "./remote-errors.mjs";
export function loadPublishToken(path) {
  if ((statSync(path).mode & 0o077) !== 0) throw new Error("Publish environment file must have mode 600");
  const token = readFileSync(path, "utf8").split(/\r?\n/).find((line) => line.startsWith("GH_TOKEN="))?.slice(9).trim();
  if (!token || /\s/.test(token)) throw new Error("Publish environment file needs a literal GH_TOKEN");
  return token;
}
export function githubClient(repo, token, fetchImpl = fetch) {
  if (!/^[\w.-]+\/[\w.-]+(?![\s\S])/.test(repo)) throw new Error("Invalid repository identity");
  const base = `https://api.github.com/repos/${repo}`;
  return {
    async request(path, { method = "GET", body, text = false } = {}) {
      let response;
      try {
        response = await fetchImpl(base + path, { method, redirect: "manual", signal: AbortSignal.timeout(30_000),
          headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10",
            "user-agent": "amox-local-maintenance", ...(body ? { "content-type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}) });
      } catch { throw new Error(`GitHub ${method} request uncertain; inspect remote state before any retry`); }
      if (text && response.status === 302) {
        const url = new URL(response.headers.get("location"));
        if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid log download redirect");
        // Never forward the GitHub bearer to a signed download URL.
        try { response = await fetchImpl(url.href, { signal: AbortSignal.timeout(30_000) }); }
        catch { throw new Error("Signed log download unavailable; private URL hidden"); }
      }
      if (!response.ok) {
        const message = `GitHub ${method} failed: HTTP ${response.status}; no response body published`;
        if (method === "GET") throw new RemoteHttpError(message, { httpStatus: response.status, phase: "github-read" });
        throw new Error(message);
      }
      try {
        if (!text) return await response.json();
        const value = await response.text();
        if (value.length > 4_000_000 || value.includes(token)) throw new Error("Unsafe log output");
        return value;
      } catch { throw new Error("Invalid/private GitHub response; no content published"); }
    },
    async pending() {
      const pulls = await this.request("/pulls?state=open&per_page=100");
      return pulls.find((pull) => pull.head.repo?.full_name === repo && pull.head.ref.startsWith("maintenance/local-"));
    },
    async publish({ work, baseCommit, branch, pull }) {
      if ((await this.request("/commits/main")).sha !== baseCommit) throw new Error("main advanced; retain this candidate for manual rebase, no automatic publication");
      if (!/^maintenance\/local-[A-Za-z0-9-]+(?![\s\S])/.test(branch)) throw new Error("Invalid maintenance branch");
      // No force push and no automatic retry of push or PR creation.
      git(work, ["push", "origin", `HEAD:refs/heads/${branch}`]);
      if (pull) return pull;
      return this.request("/pulls", { method: "POST", body: { base: "main", head: branch, draft: false,
        title: "maintenance: reviewed upstream update (local Pi)",
        body: "Local Pi adapted this candidate and the fixed Linux check gate passed. The fixed host will merge only this PR after exact-head Linux/macOS/Windows CI and all-platforms-pass succeed, provided main still matches the checked base.\n\nSource review and version-bound release summary are in maintenance/agent-review.md and maintenance/update-report.md. Release independently rechecks the merged SHA before publishing." } });
    },
    async mergeVerified({ pull, sha, baseCommit, branch, ci, log = console.log }) {
      if (!Number.isSafeInteger(pull?.number) || pull.number < 1 || !HEX40.test(sha) || !HEX40.test(baseCommit)
        || !/^maintenance\/local-[A-Za-z0-9-]+(?![\s\S])/.test(branch) || ci?.ok !== true || ci.sha !== sha) throw new Error("Missing exact-candidate merge acceptance");
      const checkPull = (current) => {
        if (current.state !== "open" || current.draft || current.head?.repo?.full_name !== repo || current.base?.repo?.full_name !== repo
          || current.head?.sha !== sha || current.head?.ref !== branch || current.base?.ref !== "main" || current.base?.sha !== baseCommit) throw new Error("PR identity/head/base/draft changed; no automatic merge");
      };
      checkPull(await this.request(`/pulls/${pull.number}`));
      const fresh = await this.waitForCI(sha, { once: true, pullNumber: pull.number, branch, log });
      if (!fresh.ok || fresh.runId !== ci.runId) throw new Error("CI acceptance changed; no automatic merge");
      checkPull(await this.request(`/pulls/${pull.number}`));
      if ((await this.request("/commits/main")).sha !== baseCommit) throw new Error("main advanced; retain PR without automatic merge");
      // GitHub atomically rejects a changed head using sha. A denied/uncertain
      // merge is never retried or replaced by a direct push to main.
      const merged = await this.request(`/pulls/${pull.number}/merge`, { method: "PUT", body: { sha, merge_method: "merge" } });
      if (merged.merged !== true || !HEX40.test(merged.sha || "")) throw new Error("Merge not confirmed; inspect PR/main before any explicit recovery");
      return { sha: merged.sha, pr: pull.html_url, ci: fresh.url };
    },
    async waitForCI(sha, { timeoutMs = 40 * 60_000, pollMs = 30000, log = console.log, once = false, pullNumber, branch } = {}) {
      const deadline = Date.now() + timeoutMs;
      let last;
      while (Date.now() < deadline) {
        const { workflow_runs: runs } = await this.request(`/actions/workflows/test.yml/runs?head_sha=${sha}&per_page=10`);
        // GitHub can return pull_requests=[] even for real pull_request runs.
        // Bind those runs to the same own-repo, unique maintenance branch/SHA;
        // the merge path separately rechecks the actual PR head and base twice.
        const run = runs.find((item) => item.head_sha === sha && item.event === "pull_request"
          && (pullNumber === undefined || (item.head_repository?.full_name === repo && item.head_branch === branch
            && (!item.pull_requests?.length || item.pull_requests.some((pull) => pull.number === pullNumber)))));
        if (run && run.status !== last) { log(`CI ${run.id}: ${run.status}${run.conclusion ? `/${run.conclusion}` : ""}`); last = run.status; }
        if (run?.status === "completed") {
          const { jobs } = await this.request(`/actions/runs/${run.id}/jobs?per_page=100`);
          const required = ["ubuntu-latest", "macos-latest", "windows-latest"].map((os) => jobs.find((job) => job.name.endsWith(`(${os})`)));
          if (run.conclusion === "success" && required.every((job) => job?.conclusion === "success")
            && jobs.some((job) => job.name === "all-platforms-pass" && job.conclusion === "success")) return { ok: true, sha, runId: run.id, url: run.html_url };
          const failed = jobs.filter((job) => job.conclusion === "failure");
          const feedback = [];
          for (const job of failed.slice(0, 3)) {
            const text = await this.request(`/actions/jobs/${job.id}/logs`, { text: true });
            feedback.push(`Job: ${job.name}\n${failureExcerpt(text)}`);
          }
          return { ok: false, runId: run.id, url: run.html_url, feedback: feedback.join("\n\n").slice(0, 60000) || "CI did not complete all required platforms successfully; do not claim success." };
        }
        if (once) throw new Error("Exact-PR CI is not completed; no automatic merge");
        await delay(pollMs);
      }
      throw new Error("Bounded CI wait ended; PR remains unmerged, no re-dispatch");
    },
  };
}
