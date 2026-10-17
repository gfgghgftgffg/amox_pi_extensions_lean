import assert from "node:assert/strict";
import test from "node:test";
import { githubClient } from "../scripts/lib/github-maintenance.mjs";

const repo = "example/repo", sha = "a".repeat(40), baseCommit = "b".repeat(40), mergedSha = "c".repeat(40);
const branch = "maintenance/local-20261017-bbbbbbb", pull = { number: 9, html_url: "https://github.com/example/repo/pull/9" };
function fixture(mode = "success") {
  const mutations = [], requests = [];
  let pullReads = 0;
  const api = githubClient(repo, "fake-host-token", async (url, options) => {
    const path = new URL(url).pathname.replace(`/repos/${repo}`, ""); requests.push(path);
    if (options.method !== "GET") {
      mutations.push({ path, method: options.method, body: JSON.parse(options.body) });
      if (mode === "ambiguous") throw new Error("private provider response must stay hidden");
      if (mode === "denied") return Response.json({}, { status: 403 });
      return Response.json({ merged: mode !== "unconfirmed", sha: mergedSha });
    }
    if (path === "/commits/main") return Response.json({ sha: mode === "main-advanced" ? "d".repeat(40) : baseCommit });
    if (path === "/pulls/9") {
      pullReads++;
      const value = { state: "open", draft: false, head: { sha, ref: branch, repo: { full_name: repo } }, base: { sha: baseCommit, ref: "main", repo: { full_name: repo } } };
      if (mode === "foreign-head") value.head.repo.full_name = "external/fork";
      if (mode === "foreign-base") value.base.repo.full_name = "external/other";
      if (mode === "draft") value.draft = true;
      if (mode === "closed") value.state = "closed";
      if (mode === "head-changed" || (mode === "late-head-change" && pullReads === 2)) value.head.sha = "d".repeat(40);
      if (mode === "branch-changed") value.head.ref = "feature/unrelated";
      if (mode === "base-changed") value.base.sha = "d".repeat(40);
      if (mode === "base-not-main") value.base.ref = "develop";
      return Response.json(value);
    }
    if (path.includes("/actions/workflows/test.yml/runs")) return Response.json({ workflow_runs: [{ id: mode === "new-ci" ? 2 : 1, head_sha: sha,
      event: "pull_request", status: mode === "ci-pending" ? "in_progress" : "completed", conclusion: "success", html_url: "https://github.com/example/repo/actions/runs/1",
      head_branch: mode === "ci-other-branch" ? "feature/other" : branch, head_repository: { full_name: mode === "ci-foreign-repo" ? "external/fork" : repo },
      pull_requests: ["empty-association", "ci-other-branch", "ci-foreign-repo"].includes(mode) ? [] : [{ number: mode === "other-pr" ? 10 : 9 }] }] });
    if (/^\/actions\/runs\/[12]\/jobs$/.test(path)) return Response.json({ jobs: ["ubuntu-latest", "macos-latest", "windows-latest"].map((os) => ({
      name: `check + contracts + production + audit (${os})`, conclusion: mode === "skipped-platform" && os === "windows-latest" ? "skipped" : "success",
    })).concat([{ name: "all-platforms-pass", conclusion: mode === "missing-gate" ? "skipped" : "success" }]) });
    throw new Error(`Unexpected fixture GET ${path}`);
  });
  return { api, mutations, requests, args: { pull, sha, baseCommit, branch, ci: { ok: true, sha, runId: 1 }, log: () => {} } };
}

test("automatic merge revalidates the same PR, exact SHA, all actual platforms and current main before one conditional PUT", async () => {
  const { api, mutations, requests, args } = fixture();
  const result = await api.mergeVerified(args);
  assert.equal(result.sha, mergedSha);
  assert.equal(requests.filter((path) => path === "/pulls/9").length, 2);
  assert.ok(requests.includes("/actions/runs/1/jobs"));
  assert.equal(requests.at(-2), "/commits/main");
  assert.deepEqual(mutations, [{ path: "/pulls/9/merge", method: "PUT", body: { sha, merge_method: "merge" } }]);
});

test("GitHub's empty pull association still requires the exact own-repo branch and independently checked PR", async () => {
  const { api, mutations, args } = fixture("empty-association");
  const result = await api.mergeVerified(args);
  assert.equal(result.sha, mergedSha); assert.equal(mutations.length, 1);
});

test("changed identity, draft, stale base/head, incomplete or unrelated CI never cause a merge", async () => {
  for (const mode of ["foreign-head", "foreign-base", "draft", "closed", "head-changed", "late-head-change", "branch-changed", "base-changed", "base-not-main", "main-advanced", "ci-pending", "other-pr", "ci-other-branch", "ci-foreign-repo", "skipped-platform", "missing-gate", "new-ci"]) {
    const { api, mutations, args } = fixture(mode);
    await assert.rejects(api.mergeVerified(args), /changed|advanced|not completed|acceptance/, mode);
    assert.deepEqual(mutations, [], mode);
  }
  for (const patch of [{ ci: { ok: false } }, { ci: { ok: true, sha: baseCommit, runId: 1 } }, { branch: "feature/foreign" }, { sha: sha + "\n" }, { pull: { number: 0 } }]) {
    const { api, mutations, args } = fixture();
    await assert.rejects(api.mergeVerified({ ...args, ...patch }), /acceptance/);
    assert.deepEqual(mutations, []);
  }
});

test("ambiguous, denied and unconfirmed merges are never retried or replaced with a main push", async () => {
  for (const mode of ["ambiguous", "denied", "unconfirmed"]) {
    const { api, mutations, args } = fixture(mode);
    await assert.rejects(api.mergeVerified(args), (error) => /uncertain|HTTP 403|not confirmed/.test(error.message) && !error.message.includes("private provider response"));
    assert.equal(mutations.length, 1, mode);
    assert.equal(mutations[0].path, "/pulls/9/merge");
  }
});
