// Host-discovery checks: load the three monorepo entrypoints in ONE real
// isolated Pi 1.1.0 session and prove that (a) only the three facades are
// registered, (b) upstream engines are not discovered as extra extensions, and
// (c) the upstream ext: selector identity (used by the Task Router) still
// resolves to the expected names.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import {
  createIsolatedEnvironment,
  isolatedEnvironmentVariables,
  loadExtensionContracts,
  resolveHostModulePath,
} from "../scripts/lib/isolated-pi-session.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const entryPaths = rootPackage.pi.extensions.map((entry) => resolve(repoRoot, entry));
const expectedTools = ["web_access", "todo", "subagent"];
const upstreamToolNames = [
  "web_search",
  "source_check",
  "fetch_content",
  "get_search_content",
  "web_enable",
  "Agent",
  "get_subagent_result",
  "steer_subagent",
  "SubagentWorkflow",
];

test("one host session loads exactly the three facades and no upstream engines", async () => {
  const env = createIsolatedEnvironment({ prefix: "amox-host-discovery-" });
  const previousEnv = {
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
    PI_CODING_AGENT_SESSION_DIR: process.env.PI_CODING_AGENT_SESSION_DIR,
    HOME: process.env.HOME,
  };
  const previousCwd = process.cwd();
  try {
    process.chdir(env.cwd);
    Object.assign(process.env, isolatedEnvironmentVariables(env));
    const result = await loadExtensionContracts({
      extensionPath: entryPaths[0],
      extraExtensionPaths: entryPaths.slice(1),
      hostModulePath: resolveHostModulePath({ requireFrom: import.meta.url }),
      env,
    });

    assert.deepEqual(result.loadErrors, []);
    assert.deepEqual(result.runtimeErrors, []);
    assert.deepEqual([...result.loadedPaths].sort(), [...entryPaths].sort(), "only the three monorepo entrypoints load");
    assert.deepEqual(result.tools.map((tool) => tool.name), expectedTools);
    assert.ok(result.tools.every((tool) => tool.active), "all three facades are active at bind");
    assert.ok(result.tools.every((tool) => tool.source !== "builtin"), "facades must not be built-in tools");
    for (const upstreamName of upstreamToolNames) {
      assert.ok(
        !result.tools.some((tool) => tool.name === upstreamName),
        `upstream tool leaked into the registry: ${upstreamName}`,
      );
    }
  } finally {
    process.chdir(previousCwd);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    env.cleanup();
  }
});

test("Task Router ext: selector identity is unchanged by the monorepo bundle", async () => {
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  const { extensionCanonicalNames } = await jiti.import("@tintinweb/pi-subagents/src/agent-runner.ts");

  for (const entryPath of entryPaths) {
    const expected = entryPath.split("/").slice(-2)[0].toLowerCase();
    const names = extensionCanonicalNames(entryPath);
    assert.ok(
      names.includes(expected),
      `${entryPath} must keep canonical name ${expected}; got ${JSON.stringify(names)}`,
    );
    assert.ok(names.every((name) => /^pi-|^rpiv-/.test(name)));
  }
});
