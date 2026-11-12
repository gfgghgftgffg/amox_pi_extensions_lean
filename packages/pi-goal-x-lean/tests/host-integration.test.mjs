import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createIsolatedEnvironment, isolatedEnvironmentVariables, resolveHostModulePath } from "../../../scripts/lib/isolated-pi-session.mjs";

function runScenario(file, scenario, overrides = {}, args = []) {
  const isolated = createIsolatedEnvironment({ prefix: "pi-goal-lean-test-" });
  try {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith("PI_GOAL_") || key.startsWith("PI_SUBAGENT_")) delete env[key];
    }
    Object.assign(env, isolatedEnvironmentVariables(isolated), {
      PI_CODING_AGENT_MODULE: resolveHostModulePath({ requireFrom: import.meta.url }),
      PI_GOAL_ROOT: join(isolated.root, "goal-pool"),
      PI_GOAL_SETTINGS_FILE: join(isolated.root, "project-goal-settings.json"),
      PI_GOAL_GLOBAL_SETTINGS_FILE: join(isolated.root, "global-goal-settings.json"),
      PI_GOAL_AUTO_CONFIRM: "1",
    }, overrides);
    writeFileSync(env.PI_GOAL_SETTINGS_FILE, "{}\n");
    writeFileSync(env.PI_GOAL_GLOBAL_SETTINGS_FILE, "{}\n");
    mkdirSync(env.PI_GOAL_ROOT);
    const sentinel = join(env.PI_GOAL_ROOT, "active_goal_parent.md");
    if (file === "worker-scenario.mjs") writeFileSync(sentinel, "Parent goal sentinel: must not be opened or changed.\n");
    const child = spawnSync(process.execPath, [fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), scenario, ...args], {
      cwd: isolated.cwd, env, encoding: "utf8", timeout: 120_000,
    });
    assert.equal(child.error, undefined, `${child.error?.stack}\n${child.stderr}`);
    assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
    if (file === "worker-scenario.mjs") {
      assert.deepEqual(readdirSync(env.PI_GOAL_ROOT), ["active_goal_parent.md"]);
      assert.equal(readFileSync(sentinel, "utf8"), "Parent goal sentinel: must not be opened or changed.\n");
    }
    return child.stdout;
  } finally { isolated.cleanup(); }
}

for (const [scenario, title] of [
  ["contracts", "real Pi SDK loader preserves the eight upstream contracts and initial active profile"],
  ["lifecycle", "goal creation, atomic task batches, evidence gate, pause, refresh and session persistence"],
  ["cohost", "three existing lean facades and sync coexist while goal controls only its own active profile"],
  ["auditor", "upstream completion-auditor injection rejects then approves through the facade"],
]) {
  test(title, { timeout: 130_000 }, () => runScenario("host-scenarios.mjs", scenario));
}
test("upstream-parity for external objective edits, including the pinned release snapshot limitation", { timeout: 260_000 }, t => {
  const observations = {};
  const prefix = "goal-refresh upstream-parity observation: ";
  for (const entry of ["upstream", "facade"]) {
    const output = runScenario("host-scenarios.mjs", "refresh-external-edit-upstream-parity", {}, [entry]);
    const records = output.split("\n").filter(line => line.startsWith(prefix));
    assert.equal(records.length, 1, `${entry}: one actual/expected observation is recorded`);
    observations[entry] = JSON.parse(records[0].slice(prefix.length));
    t.diagnostic(`${entry}: ${JSON.stringify(observations[entry])}`);
  }
  assert.deepEqual(observations.facade, observations.upstream,
    "facade get_goal content and objective/status must match the original entry's pinned snapshot limitation");
});

for (const [name, flags] of [
  ["CHILD", { PI_SUBAGENT_CHILD: "1" }],
  ["DEPTH", { PI_SUBAGENT_DEPTH: "2" }],
  ["SERVICE", {}],
]) {
  test(`${name} worker installs only a context filter and never accesses the parent goal pool`, { timeout: 130_000 },
    () => runScenario("worker-scenario.mjs", name, flags));
}
