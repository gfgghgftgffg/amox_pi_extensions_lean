// Real-upstream compatibility tests: load the pinned @juicesharp/rpiv-todo
// 2.13.5 runtime through the lean facade and exercise its actual reducer,
// schema, and persistence hook (no fake tools).
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const agentDir = mkdtempSync(join(tmpdir(), "rpiv-todo-lean-upstream-agent-"));
mkdirSync(agentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_CODING_AGENT_SESSION_DIR = join(agentDir, "sessions");

const jiti = createJiti(import.meta.url, { moduleCache: false });
const extensionModule = await jiti.import("../index.ts");
const extension = extensionModule.default ?? extensionModule;
const { __resetRpcSessions } = extensionModule;
const store = await jiti.import("@juicesharp/rpiv-todo/state/store.js");
const { __resetState } = store;
const upstreamTypes = await jiti.import("@juicesharp/rpiv-todo/tool/types.js");

function createPi() {
  const tools = [];
  const appended = [];
  const noOp = () => undefined;
  return new Proxy({
    tools,
    appended,
    registerTool(tool) { tools.push(tool); },
    appendEntry(customType, data) { appended.push({ customType, data }); },
    on: noOp,
    registerCommand: noOp,
    registerShortcut: noOp,
    registerMessageRenderer: noOp,
    events: { on: noOp, emit: noOp },
  }, { get(target, property) { return property in target ? target[property] : noOp; } });
}

const ctx = { sessionManager: { getSessionId: () => "upstream-integration" } };

function loadTool() {
  const pi = createPi();
  extension(pi);
  const tool = pi.tools.find((candidate) => candidate.name === "todo");
  assert.ok(tool, "todo tool registered");
  return { pi, tool };
}

async function run(tool, args) {
  // Pi calls prepareArguments before schema validation + execute.
  const prepared = tool.prepareArguments ? tool.prepareArguments(args) : args;
  return tool.execute("call", prepared, new AbortController().signal, () => undefined, ctx);
}

beforeEach(() => {
  __resetRpcSessions?.();
  __resetState?.();
});

test("real upstream 2.13.5 schema keeps the action/status surface", async () => {
  const { tool } = loadTool();
  const upstream = JSON.parse(JSON.stringify(upstreamTypes.TodoParamsSchema));
  const registered = JSON.parse(JSON.stringify(tool.parameters));

  assert.deepEqual(registered.properties.action.enum, upstream.properties.action.enum);
  assert.deepEqual(registered.properties.status.enum, upstream.properties.status.enum);
  assert.deepEqual(Object.keys(registered.properties), Object.keys(upstream.properties));
  assert.deepEqual(registered.required, upstream.required);
});

test("real upstream reducer runs through the facade and persists replay entries", async () => {
  const { pi, tool } = loadTool();

  const created = await run(tool, {
    subject: "Verify upstream persistence",
    description: "create through the facade",
    activeForm: "verifying upstream persistence",
    blockedBy: [],
  });
  assert.equal(created.details.action, "create");
  assert.equal(created.details.tasks.at(-1).subject, "Verify upstream persistence");
  const id = created.details.tasks.at(-1).id;
  assert.equal(pi.appended.at(-1).customType, upstreamTypes.STATE_ENTRY_TYPE);
  assert.equal(pi.appended.at(-1).data.tasks.at(-1).subject, "Verify upstream persistence");

  const started = await run(tool, { id, status: "in_progress" });
  assert.equal(started.details.action, "update");
  assert.equal(started.details.tasks.find((task) => task.id === id).status, "in_progress");

  const completed = await run(tool, { id, status: "completed" });
  assert.equal(completed.details.tasks.find((task) => task.id === id).status, "completed");
  assert.equal(pi.appended.at(-1).customType, upstreamTypes.STATE_ENTRY_TYPE);

  const readOnly = pi.appended.length;
  const listed = await run(tool, { action: "list", status: "completed" });
  assert.equal(listed.details.action, "list");
  assert.equal(listed.details.tasks.some((task) => task.id === id), true);
  assert.equal(pi.appended.length, readOnly, "read-only actions must not append state entries");

  const cleared = await run(tool, { action: "clear" });
  assert.deepEqual(cleared.details.tasks, []);
  assert.equal(cleared.details.nextId, 1);
});

test("upstream persistence entry type stays rpiv-todo-state", () => {
  assert.equal(upstreamTypes.STATE_ENTRY_TYPE, "rpiv-todo-state");
  assert.equal(upstreamTypes.TOOL_NAME, "todo");
});
