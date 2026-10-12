import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { cleanGitFixture } from "./helpers/clean-git-fixture.mjs";
import { fixtureDist, fixtureRegistryMetadata } from "./helpers/registry-fixture.mjs";
import { buildUpdatePlan } from "../scripts/lib/upstream-plan.mjs";
import { prepareCandidate } from "../scripts/lib/candidate-prepare.mjs";
import { validateCandidateArtifact } from "../scripts/lib/candidate.mjs";
import { jsonText, readJson } from "../scripts/lib/automation-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test("a renamed upstream tool can fail old-facade capture yet still reach agent adaptation with a valid lock", async () => {
  const f = cleanGitFixture(root);
  const out = mkdtempSync(join(tmpdir(), "amox-recovery-artifact-"));
  try {
    const manifest = readJson(join(f.repo, "maintenance/manifest.json"));
    const workspaces = manifest.packages.map((entry) => ({ id: entry.id, path: entry.path, packageJsonPath: `${entry.path}/package.json`, pkg: readJson(join(f.repo, entry.path, "package.json")) }));
    const metadata = { npm: {}, git: {} };
    for (const [i, entry] of manifest.packages.entries()) {
      for (const [name, version] of Object.entries(workspaces[i].pkg.dependencies)) metadata.npm[name] = { latestStable: version, gitHead: entry.upstreamGitHead };
      metadata.git[entry.upstreamRepository] = { head: entry.upstreamGitHead };
      metadata.git[entry.leanRepository] = { head: entry.leanCommit };
    }
    metadata.npm["pi-web-access"] = { latestStable: "99.0.0", gitHead: "b".repeat(40) };
    const plan = buildUpdatePlan({ manifest, workspaces, metadata });
    const snapshot = readJson(join(f.repo, "maintenance/tool-contracts.json"));
    const before = readFileSync(join(f.repo, "package-lock.json"), "utf8");
    const result = await prepareCandidate({ repoRoot: f.repo, outDir: out, plan, baselineSnapshot: snapshot,
      runCommand: (command, args, options) => {
        if (command === "npm" && args[0] === "install") {
          const path = join(options.cwd, "package-lock.json");
          const lock = readJson(path);
          Object.assign(lock.packages["node_modules/pi-web-access"], { version: "99.0.0", ...fixtureDist("pi-web-access", "99.0.0") });
          lock.packages["packages/pi-web-access-lean"].dependencies["pi-web-access"] = "99.0.0";
          writeFileSync(path, jsonText(lock));
          return { status: 0, stdout: "offline fixture install", stderr: "" };
        }
        assert.equal(command, process.execPath);
        return { status: 1, stdout: "", stderr: "Old facade cannot find a renamed upstream tool" };
      },
    });
    assert.equal(result.status, "failed");
    assert.ok(result.artifact.files.some((file) => file.path === "package-lock.json"));
    assert.equal(result.artifact.files.some((file) => file.path === "maintenance/tool-contracts.json"), false);
    const checked = await validateCandidateArtifact({ artifact: result.artifact, repoRoot: f.repo, headSha: result.artifact.baseCommit, resolveRegistryMetadata: fixtureRegistryMetadata });
    assert.equal(checked.ok, true, checked.errors.join("\n"));
    assert.equal(readFileSync(join(f.repo, "package-lock.json"), "utf8"), before, "owned baseline stays untouched");
  } finally { f.cleanup(); rmSync(out, { recursive: true, force: true }); }
});
