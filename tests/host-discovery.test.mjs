// Host-discovery checks: load all monorepo entrypoints in ONE real
// isolated Pi SDK session and prove that (a) the three existing facades and
// eight goal tools are registered, (b) upstream engines are not discovered as extra extensions, and
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
const manifest = JSON.parse(readFileSync(join(repoRoot, "maintenance/manifest.json"), "utf8"));
const entryPaths = manifest.packages.map((entry) => resolve(repoRoot, entry.path, entry.entry));
const goalTools = ["get_goal", "create_goal", "update_goal", "set_goal_tasks", "update_goal_task",
  "goal_question", "goal_questionnaire", "propose_goal_draft"];
const expectedTools = ["web_access", "todo", "subagent", ...goalTools];
const expectedActiveTools = ["web_access", "todo", "subagent", "get_goal", "create_goal"];
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

test("one host session loads the existing facades, sync and eight goal tools without extra upstream engines", async () => {
  const env = createIsolatedEnvironment({ prefix: "amox-host-discovery-" });
  const previousEnv = {
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
    PI_CODING_AGENT_SESSION_DIR: process.env.PI_CODING_AGENT_SESSION_DIR,
    HOME: process.env.HOME,
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("PI_GOAL_") || key.startsWith("PI_SUBAGENT_"))),
    PI_GOAL_ROOT: process.env.PI_GOAL_ROOT,
    PI_GOAL_SETTINGS_FILE: process.env.PI_GOAL_SETTINGS_FILE,
    PI_GOAL_GLOBAL_SETTINGS_FILE: process.env.PI_GOAL_GLOBAL_SETTINGS_FILE,
  };
  const previousCwd = process.cwd();
  try {
    process.chdir(env.cwd);
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("PI_GOAL_") || key.startsWith("PI_SUBAGENT_")) delete process.env[key];
    }
    Object.assign(process.env, isolatedEnvironmentVariables(env), {
      PI_GOAL_ROOT: join(env.root, "goal-pool"),
      PI_GOAL_SETTINGS_FILE: join(env.root, "goal-settings.json"),
      PI_GOAL_GLOBAL_SETTINGS_FILE: join(env.root, "global-goal-settings.json"),
    });
    const result = await loadExtensionContracts({
      extensionPath: entryPaths[0],
      extraExtensionPaths: entryPaths.slice(1),
      hostModulePath: resolveHostModulePath({ requireFrom: import.meta.url }),
      env,
    });

    assert.deepEqual(result.loadErrors, []);
    assert.deepEqual(result.runtimeErrors, []);
    assert.deepEqual([...result.loadedPaths].sort(), [...entryPaths].sort(), "only the declared monorepo entrypoints load");
    assert.deepEqual(result.tools.map((tool) => tool.name), expectedTools);
    assert.deepEqual(result.tools.filter(tool => tool.active).map(tool => tool.name), expectedActiveTools,
      "old facades remain active; goal advertises only its initial create/get profile");
    assert.equal(result.tools.some(tool => /goal2/i.test(tool.name)), false);
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
  const { extensionCanonicalNames } = await jiti.import("@tintinweb/pi-subagents/dist/agent-runner.js");

  for (const entryPath of entryPaths) {
    const expected = entryPath.replaceAll("\\", "/").split("/").slice(-2)[0].toLowerCase();
    const names = extensionCanonicalNames(entryPath);
    assert.ok(
      names.includes(expected),
      `${entryPath} must keep canonical name ${expected}; got ${JSON.stringify(names)}`,
    );
    assert.ok(names.every((name) => /^(?:pi-|rpiv-|amox-pi-)/.test(name)));
  }
});
