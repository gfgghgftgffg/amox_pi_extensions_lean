// Production-install portability: the verification must be self-contained on a
// clean GitHub-hosted runner that has no managed ~/.pi installation. The host
// module is resolved from the dev checkout before the production tree is
// created and passed explicitly to the workers.
//
// The test redirects TMPDIR/HOME to a scratch directory outside the repository
// (under the user cache dir) so it is independent of the runner's /tmp
// capacity while still proving that no managed ~/.pi is required.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("verify-production-install works with an isolated empty HOME and no managed Pi", { timeout: 600_000 }, () => {
  const scratchBase = join(homedir(), ".cache", "amox-lean-tests");
  mkdirSync(scratchBase, { recursive: true });
  const tempRoot = mkdtempSync(join(scratchBase, "prod-test-"));
  const home = join(tempRoot, "home");
  mkdirSync(home, { recursive: true });
  try {
    assert.equal(existsSync(join(home, ".pi")), false, "fixture HOME must start without ~/.pi");
    const env = { ...process.env, HOME: home, TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot };
    delete env.PI_CODING_AGENT_MODULE;
    delete env.PI_CODING_AGENT_DIR;
    delete env.PI_CODING_AGENT_SESSION_DIR;
    const result = spawnSync(process.execPath, ["scripts/verify-production-install.mjs"], {
      cwd: repoRoot,
      encoding: "utf8",
      env,
    });
    assert.equal(result.status, 0, `production verification must pass without ~/.pi\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Production install verification passed\./);
    assert.match(result.stdout, /Host module \(from dev checkout\): /);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
