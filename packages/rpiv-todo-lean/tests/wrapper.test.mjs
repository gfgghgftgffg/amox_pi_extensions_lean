import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Keep upstream config reads away from the host's real agent dir.
const isolatedAgentDir = mkdtempSync(join(tmpdir(), "rpiv-todo-lean-wrapper-agent-"));
mkdirSync(isolatedAgentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = isolatedAgentDir;
process.env.PI_CODING_AGENT_SESSION_DIR = join(isolatedAgentDir, "sessions");

const jiti = createJiti(import.meta.url, { moduleCache: false });
const extensionModule = await jiti.import("../index.ts");
const extension = extensionModule.default ?? extensionModule;

function createPi() {
  const tools = [];
  const commands = [];
  const shortcuts = [];
  const handlers = new Map();
  const noOp = () => undefined;
  return new Proxy(
    {
      tools,
      commands,
      shortcuts,
      handlers,
      registerTool(tool) { tools.push(tool); },
      registerCommand(name, command) { commands.push({ name, command }); },
      registerShortcut(key, shortcut) { shortcuts.push({ key, shortcut }); },
      on(event, handler) {
        const listeners = handlers.get(event) ?? [];
        listeners.push(handler);
        handlers.set(event, listeners);
      },
      events: { on: noOp, emit: noOp },
    },
    { get(target, property) { return property in target ? target[property] : noOp; } },
  );
}

function findDescriptions(value, path = "$", isPropertiesMap = false) {
  if (value === null || typeof value !== "object") return [];
  const found = !isPropertiesMap && Object.hasOwn(value, "description") ? [`${path}.description`] : [];
  for (const [key, child] of Object.entries(value)) {
    found.push(...findDescriptions(child, `${path}.${key}`, key === "properties"));
  }
  return found;
}

function loadTool() {
  const pi = createPi();
  extension(pi);
  assert.equal(pi.tools.length, 1);
  return { pi, tool: pi.tools[0] };
}

const ctx = { sessionManager: { getSessionId: () => "lean-wrapper-test" } };
const run = (tool, params) => tool.execute("call", params, new AbortController().signal, () => {}, ctx);

test("exposes the native flat schema without verbose field descriptions", () => {
  const { pi, tool } = loadTool();

  assert.equal(tool.name, "todo");
  assert.equal(tool.description, "Task tracker. action is required: create|update|list|get|delete|clear; create needs subject; update/get/delete need id.");
  assert.equal(tool.promptSnippet, "");
  assert.equal(tool.promptGuidelines.length, 1);
  assert.deepEqual(findDescriptions(tool.parameters), []);
  assert.deepEqual(Object.keys(tool.parameters.properties), [
    "action", "subject", "description", "activeForm", "status", "blockedBy",
    "addBlockedBy", "removeBlockedBy", "owner", "metadata", "id", "includeDeleted",
  ]);
  assert.deepEqual(tool.parameters.required, ["action"]);
  assert.equal(tool.prepareArguments?.({ subject: "inferred create" }).action, "create");
  assert.equal(tool.prepareArguments?.({ id: 1, status: "completed" }).action, "update");
  assert.deepEqual(tool.parameters.properties.action.enum, ["create", "update", "list", "get", "delete", "clear"]);
  assert.deepEqual(tool.parameters.properties.status.enum, ["pending", "in_progress", "completed", "deleted"]);
  assert.equal(pi.commands.some(({ name }) => name === "todos"), true);
  assert.equal(pi.handlers.has("session_start"), true);
  assert.equal(pi.handlers.has("session_compact"), true);
  assert.equal(pi.handlers.has("session_tree"), true);
  assert.equal(pi.handlers.has("session_shutdown"), true);
});

test("passes flat parameters through every action and preserves the upstream replay envelope", async () => {
  const { tool } = loadTool();

  const created = await run(tool, {
    action: "create",
    subject: "Verify lean wrapper",
    description: "Preserve behavior",
    activeForm: "verifying lean wrapper",
    blockedBy: [],
    owner: "test",
    metadata: { source: "wrapper" },
  });
  assert.equal(created.details.action, "create");
  assert.equal(created.details.params.subject, "Verify lean wrapper");
  assert.equal(created.details.tasks.at(-1).metadata.source, "wrapper");
  const id = created.details.tasks.at(-1).id;

  const fetched = await run(tool, { action: "get", id });
  assert.equal(fetched.details.action, "get");
  assert.equal(fetched.details.params.id, id);

  const started = await run(tool, { action: "update", id, status: "in_progress" });
  assert.equal(started.details.tasks.find((task) => task.id === id).status, "in_progress");

  const completed = await run(tool, { action: "update", id, status: "completed" });
  assert.equal(completed.details.tasks.find((task) => task.id === id).status, "completed");

  const listed = await run(tool, { action: "list", status: "completed" });
  assert.equal(listed.details.action, "list");
  assert.equal(listed.details.params.status, "completed");
  assert.equal(typeof listed.details.nextId, "number");
  assert.equal(listed.details.tasks.some((task) => task.id === id), true);

  const deleted = await run(tool, { action: "delete", id });
  assert.equal(deleted.details.tasks.find((task) => task.id === id).status, "deleted");

  const cleared = await run(tool, { action: "clear" });
  assert.deepEqual(cleared.details.tasks, []);
  assert.equal(cleared.details.nextId, 1);
});

test("cooperates with collapsed display before registration", () => {
  const symbol = Symbol.for("@local/pi-collapsed-tools.display-service.v1");
  const decoratedNames = new Set();
  globalThis[symbol] = {
    version: 1,
    decoratedNames,
    decorate(tool) {
      decoratedNames.add(tool.name);
      return { ...tool, __collapsedTest: true };
    },
  };

  try {
    const { tool } = loadTool();
    assert.equal(tool.__collapsedTest, true);
    assert.equal(decoratedNames.has("todo"), true);
  } finally {
    delete globalThis[symbol];
  }
});

test("stays within a compact model-facing metadata budget", () => {
  const { tool } = loadTool();
  const metadata = JSON.stringify({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    promptSnippet: tool.promptSnippet,
    promptGuidelines: tool.promptGuidelines,
  });

  assert.ok(metadata.length <= 1200, `metadata is ${metadata.length} chars`);
});
