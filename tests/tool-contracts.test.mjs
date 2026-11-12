// Tool-contract snapshot checks: the recorded upstream vs lean description /
// schema / snippet / guideline char counts must stay arithmetic-consistent and
// stay in sync with what the pinned packages register today.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createIsolatedEnvironment, isolatedEnvironmentVariables } from "../scripts/lib/isolated-pi-session.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(readFileSync(join(repoRoot, "maintenance", "tool-contracts.json"), "utf8"));

test("contract snapshot is labeled as a character proxy, not billing tokens", () => {
  assert.equal(snapshot.schemaVersion, 1);
  assert.match(snapshot.estimator, /ceil\(characters \/ 4\)/);
  assert.match(snapshot.estimator, /NOT provider tokenization or billing/i);
});

test("every recorded tool has consistent char accounting and a proxy token count", () => {
  const payloads = [...Object.values(snapshot.upstream), ...Object.values(snapshot.lean)];
  assert.ok(payloads.length >= 6);
  for (const record of payloads) {
    assert.ok(record.tools.length > 0, `${record.package} registered no tools`);
    for (const tool of record.tools) {
      assert.ok(tool.description.length > 0, `${record.package}/${tool.name} has no description`);
      assert.ok(Object.keys(tool.parameters).length > 0, `${record.package}/${tool.name} has no schema`);
      assert.ok(Array.isArray(tool.promptGuidelines));
      const { description, schema, snippet, guidelines, total } = tool.chars;
      assert.equal(description, tool.description.length);
      assert.equal(schema, JSON.stringify(tool.parameters).length);
      assert.equal(snippet, tool.promptSnippet.length);
      assert.equal(guidelines, tool.promptGuidelines.reduce((sum, line) => sum + line.length, 0));
      assert.equal(total, description + schema + snippet + guidelines);
      assert.equal(tool.proxyTokens, Math.ceil(total / 4));
    }
    assert.equal(
      record.totals.registeredProxyTokens,
      record.tools.reduce((sum, tool) => sum + tool.proxyTokens, 0),
    );
    assert.equal(
      record.totals.activeProxyTokens,
      record.tools.reduce((sum, tool) => sum + (tool.active ? tool.proxyTokens : 0), 0),
    );
  }
});

test("lean facades are smaller than their pinned upstream engines", () => {
  assert.deepEqual(
    Object.values(snapshot.lean).map((record) => record.tools.map((tool) => tool.name)).flat().sort(),
    ["create_goal", "get_goal", "goal_question", "goal_questionnaire", "propose_goal_draft",
      "set_goal_tasks", "subagent", "todo", "update_goal", "update_goal_task", "web_access"],
  );
  for (const [id, record] of Object.entries(snapshot.lean)) {
    const upstream = snapshot.upstream[record.upstreamPackage];
    assert.ok(upstream, `${id} has no upstream contract for ${record.upstreamPackage}`);
    assert.ok(
      record.totals.registeredProxyTokens < upstream.totals.registeredProxyTokens,
      `${id} is not smaller than ${record.upstreamPackage}`,
    );
    assert.ok(
      record.totals.activeProxyTokens < upstream.totals.activeProxyTokens,
      `${id} is not smaller than the active ${record.upstreamPackage} surface`,
    );
  }
});

test("the tracked snapshot matches a fresh isolated capture", { timeout: 300_000 }, () => {
  const isolated = createIsolatedEnvironment({ prefix: "amox-goal-contract-check-" });
  try {
    const env = { ...process.env, ...isolatedEnvironmentVariables(isolated) };
    for (const key of Object.keys(env)) {
      if (key.startsWith("PI_GOAL_") || key.startsWith("PI_SUBAGENT_")) delete env[key];
    }
    Object.assign(env, {
      PI_GOAL_ROOT: join(isolated.root, "goal-pool"),
      PI_GOAL_SETTINGS_FILE: join(isolated.root, "goal-settings.json"),
      PI_GOAL_GLOBAL_SETTINGS_FILE: join(isolated.root, "global-goal-settings.json"),
    });
    const check = spawnSync(process.execPath, [join(repoRoot, "scripts/capture-contracts.mjs"), "--check"], {
      cwd: isolated.cwd, env, encoding: "utf8", timeout: 290_000,
    });
    assert.equal(check.error, undefined, check.error?.message);
    assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
    assert.match(check.stdout, /snapshot is current/);
  } finally { isolated.cleanup(); }
});
