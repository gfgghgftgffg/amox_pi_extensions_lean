// Compare upstream source and its published build in separate real Pi hosts.
// Runtime regressions use dist directly; this catches stale compiled contracts.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHostModulePath } from "../../../scripts/lib/isolated-pi-session.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);

test("published subagents dist preserves source tool contracts and session initialization", { timeout: 150_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-subagents-dist-"));
  try {
    const results = ["src/index.ts", "dist/index.js"].map((entry, index) => {
      const resultPath = join(dir, `${index}.result.json`);
      const input = join(dir, `${index}.input.json`);
      writeFileSync(input, JSON.stringify({
        id: "subagents-dist-parity",
        extensionPath: require.resolve(`@tintinweb/pi-subagents/${entry}`),
        resultPath,
        hostModulePath: resolveHostModulePath({ requireFrom: import.meta.url }),
      }));
      const child = spawnSync(process.execPath, [join(repoRoot, "scripts/lib/capture-worker.mjs"), input], {
        cwd: repoRoot, encoding: "utf8", timeout: 70_000,
      });
      assert.equal(child.status, 0, `${entry}: ${child.error ?? child.stderr}`);
      const result = JSON.parse(readFileSync(resultPath, "utf8"));
      assert.deepEqual(result.loadErrors, []);
      assert.deepEqual(result.runtimeErrors, []);
      assert.deepEqual(result.tools.map((tool) => tool.name).sort(), ["Agent", "SubagentWorkflow", "get_subagent_result", "steer_subagent"].sort());
      return result;
    });
    assert.deepEqual(results[1].tools, results[0].tools, "npm dist must not have stale descriptions, schemas or activation");
    assert.deepEqual(results[1].activeToolNames, results[0].activeToolNames);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
