import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const agentDir = mkdtempSync(join(tmpdir(), "todo-215-agent-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_CODING_AGENT_SESSION_DIR = join(agentDir, "sessions");
const jiti = createJiti(import.meta.url, { moduleCache: true });
const mod = await jiti.import("../index.ts");
const extension = mod.default ?? mod;
const store = await jiti.import("@juicesharp/rpiv-todo/state/store.js");
const { Value } = await jiti.import("typebox/value");
const { TodoParamsSchema } = await jiti.import("@juicesharp/rpiv-todo/tool/types.ts");
const sessionId = "batch-facade";
const ctx = { mode: "rpc", hasUI: false, sessionManager: { getSessionId: () => sessionId, getBranch: () => [] } };

function load() {
  const tools = [], appended = [], handlers = new Map();
  const noOp = () => undefined;
  extension(new Proxy({
    registerTool: (tool) => tools.push(tool),
    appendEntry: (customType, data) => appended.push({ type: "custom", customType, data }),
    on: (event, handler) => handlers.set(event, handler),
    registerCommand: noOp, registerShortcut: noOp,
    events: { on: noOp, emit: noOp },
  }, { get: (target, key) => key in target ? target[key] : noOp }));
  assert.equal(tools.length, 1);
  const tool = tools[0];
  const run = async (args) => {
    const prepared = tool.prepareArguments(args);
    assert.deepEqual([...Value.Errors(tool.parameters, prepared)], []);
    return tool.execute("batch", prepared, new AbortController().signal, noOp, ctx);
  };
  return { tool, run, appended, handlers };
}

beforeEach(() => { store.__resetState(); mod.__resetRpcSessions(); });

test("compact schema preserves upstream validation and does not mutate the upstream schema", () => {
  const original = JSON.stringify(TodoParamsSchema);
  const { tool } = load();
  assert.equal(JSON.stringify(TodoParamsSchema), original);
  assert.ok(TodoParamsSchema.properties.subject.description);
  assert.deepEqual(Object.keys(tool.parameters.properties), Object.keys(TodoParamsSchema.properties));
  assert.deepEqual(Object.keys(tool.parameters.properties.tasks.items.properties), Object.keys(TodoParamsSchema.properties.tasks.items.properties));
  for (const args of [
    { action: "list" },
    { action: "create", subject: "Single", metadata: { count: 1, nested: [null, true] } },
    { action: "create", tasks: [{ subject: "Batch", description: "Keep", metadata: { "line\nkey": null, nested: { values: [false, 2] } } }] },
    { action: "update", id: 1, status: "in_progress", addBlockedBy: [2], removeBlockedBy: [3] },
    { action: "list", status: "deleted", includeDeleted: true },
    { action: 1 }, { action: "unknown" }, { action: "list", status: "unknown" },
    { action: "create", subject: 1 }, { action: "create", metadata: [] },
    { action: "create", metadata: null }, { action: "create", tasks: "invalid" },
    { action: "create", tasks: [{ subject: 1 }] },
    { action: "create", tasks: [{ description: "Missing subject" }] },
    { action: "create", tasks: [{ subject: "Bad metadata", metadata: [] }] },
    { action: "create", tasks: [{ subject: "Bad dependency", blockedBy: ["1"] }] },
    { tasks: [{ subject: "Missing action" }] },
  ]) {
    const native = [...Value.Errors(TodoParamsSchema, args)].length === 0;
    const compact = [...Value.Errors(tool.parameters, args)].length === 0;
    assert.equal(compact, native, JSON.stringify(args));
  }
});

test("batch create keeps nested data fields, normalizes upstream arguments and persists one snapshot", async () => {
  const { tool, run, appended } = load();
  assert.equal(tool.name, "todo");
  assert.deepEqual(tool.parameters.required, ["action"]);
  const itemSchema = tool.parameters.properties.tasks.items;
  assert.ok(itemSchema.properties.description, "task description remains an input field");
  assert.equal(itemSchema.properties.subject.description, undefined);
  assert.match(tool.description, /subject or tasks\[\]/);
  const tasks = [{ subject: "Inspect", description: "Read sources", owner: "reviewer", metadata: { scope: "facade" } }, { subject: "Test", activeForm: "testing" }];
  const args = { action: "create", tasks: JSON.stringify(tasks.map(JSON.stringify)) };
  const prepared = tool.prepareArguments(args);
  assert.deepEqual(prepared.tasks, tasks);
  assert.equal(args.tasks, JSON.stringify(tasks.map(JSON.stringify)), "input is not mutated");
  assert.deepEqual(tool.prepareArguments(prepared), prepared);
  const result = await run(args);
  assert.equal(result.content[0].text, "Created #1: Inspect (pending)\nCreated #2: Test (pending)");
  assert.deepEqual(result.details.tasks.map(({ id, status }) => ({ id, status })), [{ id: 1, status: "pending" }, { id: 2, status: "pending" }]);
  assert.equal(result.details.tasks[0].description, "Read sources");
  assert.equal(result.details.tasks[0].owner, "reviewer");
  assert.deepEqual(result.details.tasks[0].metadata, { scope: "facade" });
  assert.equal(result.details.nextId, 3);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].customType, "rpiv-todo-state");
  assert.deepEqual(appended[0].data, result.details);
  assert.equal(tool.prepareArguments({ tasks }).action, undefined, "batch calls still require explicit action");
});

test("batch rejection is atomic and reports details.error without persisting a failed mutation", async () => {
  const { run, appended } = load();
  const initial = await run({ action: "create", subject: "Existing" });
  for (const params of [
    { tasks: [{ subject: "Good" }, { subject: " " }] },
    { tasks: [{ subject: "Good" }], subject: "Conflict" },
    { tasks: [{ subject: "Good" }], owner: "top-level" },
    { tasks: [{ subject: "Prerequisite" }, { subject: "Dependent", blockedBy: [2] }] },
    { tasks: [] },
  ]) {
    const result = await run({ action: "create", ...params });
    assert.equal(typeof result.details.error, "string");
    assert.equal(result.content[0].text, `Error: ${result.details.error}`);
    assert.deepEqual(result.details.tasks, initial.details.tasks);
    assert.equal(result.details.nextId, 2);
    assert.equal(appended.length, 1);
  }
  const dependent = await run({ action: "create", tasks: [{ subject: "Uses existing", blockedBy: [1] }] });
  assert.deepEqual(dependent.details.tasks.at(-1).blockedBy, [1]);
});

test("RPC lifecycle replay ignores corrupt snapshots after a valid batch snapshot", async () => {
  const { run, appended, handlers } = load();
  const result = await run({ action: "create", tasks: [{ subject: "Keep" }, { subject: "Also keep" }] });
  const branch = [...appended, { type: "custom", customType: "rpiv-todo-state", data: { ...result.details, tasks: ["[output-policy: array truncated]"] } }];
  const replayCtx = { ...ctx, sessionManager: { getSessionId: () => sessionId, getBranch: () => branch } };
  store.evictSession(sessionId);
  for (const event of ["session_start", "session_compact", "session_tree"]) {
    await handlers.get(event)({}, replayCtx);
    assert.deepEqual(store.getState(sessionId), { tasks: result.details.tasks, nextId: 3 });
  }
});

test("delegated render hooks show batch counts and failures separately from model output", async () => {
  const { tool, run } = load();
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  const rendered = (component) => component.render(120).join("\n");
  assert.doesNotMatch(rendered(tool.renderCall({}, theme, {})), /undefined/);
  assert.match(rendered(tool.renderCall({ action: "create", tasks: [{ subject: "A" }, { subject: "B" }] }, theme, {})), /2 tasks/);
  const failure = await run({ action: "update", id: 999, status: "completed" });
  assert.equal(failure.content[0].text, "Error: #999 not found");
  assert.match(rendered(tool.renderResult(failure, {}, theme, {})), /✗ #999 not found/);
  assert.doesNotMatch(rendered(tool.renderResult(failure, {}, theme, {})), /●|✓/);
  assert.match(rendered(tool.renderResult({ content: [{ type: "text", text: "Validation failed\nDetails" }] }, {}, theme, { isError: true })), /✗ Validation failed/);
});
