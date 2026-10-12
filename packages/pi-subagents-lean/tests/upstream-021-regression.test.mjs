// Regression coverage for the pinned 0.21.0 runtime seams used by the facade.
// No model calls, MCP servers, shell commands, or copied upstream implementation.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
import { Type } from "typebox";

const root = mkdtempSync(join(tmpdir(), "subagents-lean-021-"));
const agentDir = join(root, "agent");
mkdirSync(agentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
const jiti = createJiti(import.meta.url);
const { installExtensionToolScope } = await jiti.import("@tintinweb/pi-subagents/src/agent-runner.ts");
const { createWorkflowHost } = await jiti.import("@tintinweb/pi-subagents/src/workflow/host.ts");
const { registerAgents } = await jiti.import("@tintinweb/pi-subagents/src/agent-types.ts");
const { createSubagentsFacade } = await jiti.import("../index.ts");

// The new handoff result/update shapes must travel through the facade intact.
// This checks the adapter boundary, not keyboard handling or notification timing.
test("facade preserves foreground handoff updates, background result and steering notification", async () => {
  const tools = [];
  const notifications = [];
  const hooks = [];
  const signal = new AbortController().signal;
  const ctx = { cwd: root };
  const update = { content: [{ type: "text", text: "working" }], details: { status: "running", backgroundHint: true, durationMs: 2500 } };
  const result = { content: [{ type: "text", text: "Agent started in background" }], details: { status: "background", agentId: "handoff-id" }, usage: { output: 3 } };
  const pi = {
    registerTool(tool) { tools.push(tool); },
    on(event, handler) { hooks.push({ event, handler }); },
    sendMessage(message, options) { notifications.push({ message, options }); },
  };
  createSubagentsFacade((capture) => {
    capture.on("session_start", () => capture.sendMessage(
      { customType: "subagent-notification", content: "Finished", display: true },
      { deliverAs: "steer", triggerTurn: true },
    ));
    capture.registerTool({
      name: "Agent",
      parameters: Type.Object({ prompt: Type.String(), description: Type.String(), subagent_type: Type.String(), run_in_background: Type.Optional(Type.Boolean()) }),
      async execute(callId, params, passedSignal, onUpdate, passedCtx) {
        assert.equal(callId, "foreground");
        assert.equal(params.run_in_background, false);
        assert.equal(passedSignal, signal);
        assert.equal(passedCtx, ctx);
        onUpdate(update);
        return result;
      },
    });
  })(pi);
  const updates = [];
  assert.equal(await tools[0].execute("foreground", { op: "run", prompt: "Inspect", description: "inspect code", subagent_type: "Explore", run_in_background: false }, signal, (value) => updates.push(value), ctx), result);
  assert.equal(updates[0], update);
  hooks[0].handler();
  assert.deepEqual(notifications[0].options, { deliverAs: "steer", triggerTurn: true });
  assert.deepEqual(tools.map((tool) => tool.name), ["subagent"]);
});

// Assert observable selection/veto behavior, including late registration and
// tool-search activation; the same scope is used for nested executeTool calls.
test("0.21.0 child scope preserves deferred exposure and gates nested calls", async () => {
  const definitions = new Map([
    ["read", { name: "read" }],
    ["direct", { name: "direct", exposure: "direct" }],
    ["hidden", { name: "hidden", defaultActive: false }],
    ["deferred", { name: "deferred", exposure: "deferred" }],
    ["script", { name: "script", exposure: "codemode" }],
    ["outside", { name: "outside" }],
    ["Agent", { name: "Agent" }],
  ]);
  const tools = new Map(["direct", "hidden", "deferred", "script", "Agent"].map((name) => [name, definitions.get(name)]));
  let active = ["read", "outside"];
  let listener;
  let priorCalls = 0;
  const session = {
    agent: { beforeToolCall: async () => { priorCalls++; return { block: false }; } },
    getAllTools: () => [...definitions.values()],
    getToolDefinition: (name) => definitions.get(name),
    getActiveToolNames: () => active,
    setActiveToolsByName: (names) => { active = names; },
    subscribe: (callback) => { listener = callback; },
  };
  const gate = {};
  installExtensionToolScope(session, {
    loader: { getExtensions: () => ({ extensions: [{ path: "builtin:mcp", tools }] }) },
    toolNames: ["read"],
    disallowedSet: undefined,
    extNames: new Set(),
    narrowing: new Map(),
    readmitToolNames: new Set(),
    nestedCallGate: gate,
  });
  assert.deepEqual(active, ["read", "direct"]);
  assert.equal(gate.allows("deferred"), true, "deferred tools remain callable in scope");
  assert.equal(gate.allows("outside"), false);
  assert.equal(gate.allows("Agent"), false, "top-level delegation is excluded from children");
  const blocked = await session.agent.beforeToolCall({ toolCall: { name: "outside" } });
  assert.equal(blocked.block, true);
  assert.equal(priorCalls, 0);
  assert.deepEqual(await session.agent.beforeToolCall({ toolCall: { name: "direct" } }), { block: false });
  assert.equal(priorCalls, 1);

  active.push("deferred"); // tool_search made an in-scope deferred tool active.
  listener({ type: "turn_end" });
  assert.deepEqual(active, ["read", "direct", "deferred"]);
  definitions.set("late", { name: "late", exposure: "model-only" });
  tools.set("late", definitions.get("late"));
  listener({ type: "turn_end" });
  assert.deepEqual(active, ["read", "direct", "deferred", "late"]);
  assert.equal(gate.allows("late"), true);
  tools.delete("deferred");
  listener({ type: "turn_end" });
  assert.deepEqual(active, ["read", "direct", "late"]);
  assert.equal(gate.allows("deferred"), false);
});

test("0.21.0 workflow host forwards agent-file isolated without inheriting worktree isolation", async () => {
  const ctx = { cwd: root, ui: { notify() {} }, modelRegistry: { getAvailable: () => [] } };
  try {
    for (const isolated of [true, false, undefined]) {
      registerAgents(new Map([["Hermetic", { name: "Hermetic", isolated, isolation: "worktree" }]]));
      const calls = [];
      const record = { status: "completed", result: "done", toolUses: 0, lifetimeUsage: { input: 0, output: 0, cacheWrite: 0, cost: 0 } };
      const manager = {
        getRecord: () => record,
        async spawnAndWait(pi, context, type, prompt, options, onSpawned) {
          calls.push({ pi, context, type, prompt, options });
          onSpawned("child");
          return { record };
        },
      };
      const pi = {};
      const host = createWorkflowHost({ pi, ctx, manager, workflowId: "wf_test123" });
      assert.equal((await host.spawnAgent({ agentId: "script-child", agentType: "Hermetic", prompt: "Inspect", label: "inspect code" })).ok, true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].type, "Hermetic");
      assert.equal(calls[0].options.isolated, isolated);
      assert.equal(Object.hasOwn(calls[0].options, "isolated"), isolated !== undefined);
      assert.equal(calls[0].options.workflowId, "wf_test123");
      assert.equal(Object.hasOwn(calls[0].options, "isolation"), false, "workflow worktrees come only from script options");
      await host.spawnAgent({ agentId: "script-worktree", agentType: "Hermetic", prompt: "Inspect", label: "inspect copy", isolation: "worktree" });
      assert.equal(calls[1].options.isolation, "worktree");
    }
  } finally {
    registerAgents(new Map());
  }
});
