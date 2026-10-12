import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createJiti } from "jiti";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Keep upstream config reads away from the host's real agent dir.
const isolatedAgentDir = mkdtempSync(join(tmpdir(), "rpiv-todo-lean-rpc-agent-"));
mkdirSync(isolatedAgentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = isolatedAgentDir;
process.env.PI_CODING_AGENT_SESSION_DIR = join(isolatedAgentDir, "sessions");

const jiti = createJiti(import.meta.url, { moduleCache: false });
const extensionModule = await jiti.import("../index.ts");
const extension = extensionModule.default ?? extensionModule;
const { __resetRpcSessions } = extensionModule;
const store = await jiti.import("@juicesharp/rpiv-todo/state/store.js");
const { __resetState } = store;

const mockTheme = {
  fg: (_c, text) => text,
  bg: (_c, text) => text,
  bold: (text) => text,
  strikethrough: (text) => text,
  dim: (text) => text,
  italic: (text) => text,
  underline: (text) => text,
};

function createMockUi() {
  const widgets = new Map();
  return {
    widgets,
    theme: mockTheme,
    setWidget(key, factory, options) {
      if (!factory) {
        widgets.delete(key);
        return;
      }
      let renderedLines = [];
      const tui = {
        requestRender() {
          const comp = factory(tui, mockTheme);
          renderedLines = comp.render(80);
          widgets.set(key, { renderedLines, options });
        },
      };
      const comp = factory(tui, mockTheme);
      renderedLines = comp.render(80);
      widgets.set(key, { renderedLines, options });
    },
    notify(_msg, _type) {},
  };
}

function createMockPi() {
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
      async emit(eventType, event, ctx) {
        const listeners = handlers.get(eventType) ?? [];
        for (const handler of listeners) {
          await handler(event, ctx);
        }
      },
      events: { on: noOp, emit: noOp },
    },
    { get(target, property) { return property in target ? target[property] : noOp; } },
  );
}

function createRpcCtx(sessionId, ui) {
  return {
    mode: "rpc",
    hasUI: true,
    ui,
    sessionManager: {
      getSessionId: () => sessionId,
      getBranch: () => [],
    },
  };
}

beforeEach(() => {
  __resetRpcSessions?.();
  __resetState?.();
});

test("supports isolated concurrent RPC sessions with independent overlay widgets", async () => {
  const pi = createMockPi();
  extension(pi);
  const tool = pi.tools.find((t) => t.name === "todo");
  assert.ok(tool, "todo tool registered");

  const ui1 = createMockUi();
  const ctx1 = createRpcCtx("rpc-session-1", ui1);

  const ui2 = createMockUi();
  const ctx2 = createRpcCtx("rpc-session-2", ui2);

  // 1. Start session 1
  await pi.emit("session_start", {}, ctx1);
  assert.equal(ui1.widgets.has("rpiv-todos"), false, "No widget when empty in session 1");

  // 2. Start session 2
  await pi.emit("session_start", {}, ctx2);
  assert.equal(ui2.widgets.has("rpiv-todos"), false, "No widget when empty in session 2");

  // 3. Create a task in session 1
  const signal = new AbortController().signal;
  await tool.execute("call-1", { action: "create", subject: "Task in Session 1" }, signal, () => {}, ctx1);
  await pi.emit("tool_execution_end", { toolName: "todo", isError: false }, ctx1);

  assert.equal(ui1.widgets.has("rpiv-todos"), true, "Session 1 has widget registered");
  assert.equal(ui2.widgets.has("rpiv-todos"), false, "Session 2 has NO widget registered");
  const s1Lines = ui1.widgets.get("rpiv-todos").renderedLines.join("\n");
  assert.ok(s1Lines.includes("Task in Session 1"), "Session 1 widget shows its own task");

  // 4. Create two tasks in session 2
  await tool.execute("call-2", { action: "create", subject: "Session 2 Task A" }, signal, () => {}, ctx2);
  await tool.execute("call-3", { action: "create", subject: "Session 2 Task B" }, signal, () => {}, ctx2);
  await pi.emit("tool_execution_end", { toolName: "todo", isError: false }, ctx2);

  assert.equal(ui2.widgets.has("rpiv-todos"), true, "Session 2 has widget registered");
  const s2Lines = ui2.widgets.get("rpiv-todos").renderedLines.join("\n");
  assert.ok(s2Lines.includes("Session 2 Task A"), "Session 2 widget shows task A");
  assert.ok(s2Lines.includes("Session 2 Task B"), "Session 2 widget shows task B");
  assert.ok(!s2Lines.includes("Task in Session 1"), "Session 2 does NOT see session 1 task");

  // Verify Session 1 still has only its own task
  const s1LinesAfter = ui1.widgets.get("rpiv-todos").renderedLines.join("\n");
  assert.ok(s1LinesAfter.includes("Task in Session 1"), "Session 1 still has its own task");
  assert.ok(!s1LinesAfter.includes("Session 2 Task"), "Session 1 does NOT see session 2 tasks");

  // 5. Shutdown session 1, verify session 2 remains intact
  await pi.emit("session_shutdown", {}, ctx1);
  assert.equal(ui1.widgets.has("rpiv-todos"), false, "Session 1 widget cleared on shutdown");
  assert.equal(ui2.widgets.has("rpiv-todos"), true, "Session 2 widget remains active");

  // 6. Complete task in session 2 and refresh
  await tool.execute("call-4", { action: "update", id: 1, status: "completed" }, signal, () => {}, ctx2);
  await pi.emit("tool_execution_end", { toolName: "todo", isError: false }, ctx2);
  const s2LinesUpdated = ui2.widgets.get("rpiv-todos").renderedLines.join("\n");
  assert.ok(s2LinesUpdated.includes("Todos (1/2)"), "Session 2 widget reflected completed task count");
});

test("non-rpc mode delegates cleanly to upstream handler", async () => {
  const pi = createMockPi();
  extension(pi);
  const cliUi = createMockUi();
  const cliCtx = {
    mode: "interactive",
    hasUI: true,
    ui: cliUi,
    sessionManager: {
      getSessionId: () => "cli-session",
      getBranch: () => [],
    },
  };

  await pi.emit("session_start", {}, cliCtx);
  // No error thrown and upstream executed
});
