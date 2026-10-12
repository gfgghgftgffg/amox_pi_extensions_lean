// Stale-ctx regressions for the lean rpiv-todo facade.
//
// Pi 1.1 invalidates the extension runner after session replacement/reload and
// throws `This extension ctx is stale after session replacement or reload...`
// from every property of a dead ctx proxy. Older Pi hosts threw
// `Session is no longer valid`. The facade must swallow exactly those two
// messages — after its preliminary ctx.mode/hasUI/ui reads — and must keep
// propagating unrelated errors so real replay bugs still surface.
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import {
  createIsolatedEnvironment,
  isolatedEnvironmentVariables,
  resolveHostModulePath,
} from "../../../scripts/lib/isolated-pi-session.mjs";

// Keep upstream config reads away from the host's real agent dir.
const isolatedAgentDir = mkdtempSync(join(tmpdir(), "rpiv-todo-lean-stale-agent-"));
mkdirSync(isolatedAgentDir, { recursive: true });
process.env.PI_CODING_AGENT_DIR = isolatedAgentDir;
process.env.PI_CODING_AGENT_SESSION_DIR = join(isolatedAgentDir, "sessions");

const jiti = createJiti(import.meta.url, { moduleCache: false });
const extensionModule = await jiti.import("../index.ts");
const extension = extensionModule.default ?? extensionModule;
const { __resetRpcSessions } = extensionModule;
const store = await jiti.import("@juicesharp/rpiv-todo/state/store.js");
const { __resetState } = store;

const NEW_STALE_MESSAGE =
  "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";
const OLD_STALE_MESSAGE = "Session is no longer valid";

const EVENT_CALLS = [
  ["session_start", {}],
  ["session_compact", {}],
  ["session_tree", {}],
  ["session_shutdown", {}],
  ["agent_start", {}],
  ["tool_execution_end", { toolName: "todo", isError: false }],
];

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
  return {
    theme: mockTheme,
    setWidget() {},
    notify() {},
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
      events: { on: noOp, emit: noOp },
    },
    { get(target, property) { return property in target ? target[property] : noOp; } },
  );
}

function loadExtension() {
  const pi = createMockPi();
  extension(pi);
  return pi;
}

async function callEventHandlers(pi, event, payload, ctx) {
  for (const handler of pi.handlers.get(event) ?? []) {
    await handler(payload, ctx);
  }
}

/** A ctx whose every getter is a dead proxy, like Pi 1.1's invalidated ctx. */
function staleProxyCtx(message) {
  return {
    get mode() { throw new Error(message); },
    get hasUI() { throw new Error(message); },
    get ui() { throw new Error(message); },
    get sessionManager() { throw new Error(message); },
  };
}

/** A still-readable ctx whose session manager reports a stale session. */
function staleSidCtx(message) {
  return {
    mode: "rpc",
    hasUI: true,
    ui: createMockUi(),
    sessionManager: {
      getSessionId() { throw new Error(message); },
      getBranch() { return []; },
    },
  };
}

/** A dead-proxy command ctx (the upstream /todos handler only needs hasUI/ui). */
function commandCtx(error) {
  return {
    get mode() { throw error; },
    hasUI: false,
    ui: { notify() {} },
  };
}

beforeEach(() => {
  __resetRpcSessions?.();
  __resetState?.();
});

for (const [label, message] of [["Pi 1.1", NEW_STALE_MESSAGE], ["legacy", OLD_STALE_MESSAGE]]) {
  test(`swallows the ${label} stale-ctx message from every registered event handler`, async () => {
    for (const [event, payload] of EVENT_CALLS) {
      const pi = loadExtension();
      await assert.doesNotReject(
        callEventHandlers(pi, event, payload, staleProxyCtx(message)),
        `${event} must not surface the recognized stale error`,
      );
    }
  });

  test(`swallows a stale session id reported as the ${label} message`, async () => {
    for (const [event, payload] of EVENT_CALLS) {
      const pi = loadExtension();
      await assert.doesNotReject(
        callEventHandlers(pi, event, payload, staleSidCtx(message)),
        `${event} must not surface the recognized stale error`,
      );
    }
  });
}

test("swallows recognized stale errors from the shortcut and /todos command", async () => {
  const pi = loadExtension();
  const shortcut = pi.shortcuts[0]?.shortcut;
  assert.ok(shortcut, "collapse shortcut registered");
  const command = pi.commands.find(({ name }) => name === "todos")?.command;
  assert.ok(command, "todos command registered");

  for (const message of [NEW_STALE_MESSAGE, OLD_STALE_MESSAGE]) {
    assert.doesNotThrow(() => shortcut.handler(staleProxyCtx(message)));
    await assert.doesNotReject(
      command.handler("", commandCtx(new Error(message))),
      "the awaited /todos wrapper must not surface a recognized stale error",
    );
  }
});

test("propagates unrelated ctx errors instead of swallowing them", async () => {
  const probeError = () => {
    const ctx = {
      get mode() { throw new Error("mode probe exploded"); },
    };
    return ctx;
  };
  const sidError = () => ({
    mode: "rpc",
    hasUI: true,
    ui: createMockUi(),
    sessionManager: {
      getSessionId() { throw new Error("session id exploded"); },
      getBranch() { return []; },
    },
  });

  for (const [event, payload] of EVENT_CALLS) {
    const pi = loadExtension();
    await assert.rejects(
      callEventHandlers(pi, event, payload, probeError()),
      /mode probe exploded/,
      `${event} must propagate a non-stale preliminary probe error`,
    );
    await assert.rejects(
      callEventHandlers(pi, event, payload, sidError()),
      /session id exploded/,
      `${event} must propagate a non-stale session id error`,
    );
  }

  const pi = loadExtension();
  const shortcut = pi.shortcuts[0].shortcut;
  assert.throws(() => shortcut.handler(probeError()), /mode probe exploded/);
  assert.throws(() => shortcut.handler(sidError()), /session id exploded/);

  const command = pi.commands.find(({ name }) => name === "todos").command;
  await assert.rejects(
    command.handler("", commandCtx(new Error("mode probe exploded"))),
    /mode probe exploded/,
    "the awaited /todos wrapper must propagate a non-stale preliminary error",
  );
});

test("awaits the upstream /todos command before refreshing the RPC overlay", async () => {
  const pi = loadExtension();
  const command = pi.commands.find(({ name }) => name === "todos").command;
  const tool = pi.tools.find((t) => t.name === "todo");
  assert.ok(command && tool, "todos command and tool registered");

  const calls = [];
  const ui = {
    theme: mockTheme,
    notify(message, type) { calls.push({ kind: "notify", message, type }); },
    setWidget(key, factory, options) { calls.push({ kind: "setWidget", key, factory, options }); },
  };
  const ctx = {
    mode: "rpc",
    hasUI: true,
    ui,
    sessionManager: { getSessionId: () => "cmd-happy", getBranch: () => [] },
  };
  await callEventHandlers(pi, "session_start", {}, ctx);
  await tool.execute(
    "call-cmd-1",
    { action: "create", subject: "Command happy path" },
    new AbortController().signal,
    () => {},
    ctx,
  );
  calls.length = 0;

  const result = command.handler("", ctx);
  assert.ok(result && typeof result.then === "function", "the wrapped /todos handler is async");
  await assert.doesNotReject(result, "the happy-path /todos command must settle");
  assert.deepEqual(
    calls.map((call) => call.kind),
    ["notify", "setWidget"],
    "upstream command ran to completion before the RPC overlay refresh",
  );
  assert.equal(calls[1].key, "rpiv-todos");

  // Non-RPC delegation stays awaited and skips the RPC overlay path.
  const cliCalls = [];
  const cliCtx = {
    mode: "interactive",
    hasUI: true,
    ui: {
      theme: mockTheme,
      notify() { cliCalls.push("notify"); },
      setWidget() { cliCalls.push("setWidget"); },
    },
    sessionManager: { getSessionId: () => "cmd-happy-cli", getBranch: () => [] },
  };
  const cliResult = command.handler("", cliCtx);
  assert.ok(cliResult && typeof cliResult.then === "function", "non-RPC /todos delegation is awaited");
  await assert.doesNotReject(cliResult, "the non-RPC /todos command must settle");
  assert.deepEqual(cliCalls, ["notify"], "non-RPC delegation runs upstream without the RPC overlay");
});

test("handles a real Pi 1.1 invalidated ctx without reporting a stale error", async () => {
  const env = createIsolatedEnvironment({ prefix: "rpiv-todo-lean-stale-host-" });
  const previousEnv = {
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
    PI_CODING_AGENT_SESSION_DIR: process.env.PI_CODING_AGENT_SESSION_DIR,
    HOME: process.env.HOME,
  };
  const previousCwd = process.cwd();
  try {
    process.chdir(env.cwd);
    Object.assign(process.env, isolatedEnvironmentVariables(env));
    const host = await import(pathToFileURL(resolveHostModulePath({ requireFrom: import.meta.url })).href);
    const extensionEntry = resolve(dirname(fileURLToPath(import.meta.url)), "../index.ts");
    const settingsManager = host.SettingsManager.create(env.cwd, env.agentDir);
    const loader = new host.DefaultResourceLoader({
      cwd: env.cwd,
      agentDir: env.agentDir,
      settingsManager,
      additionalExtensionPaths: [extensionEntry],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const { session } = await host.createAgentSession({
      cwd: env.cwd,
      agentDir: env.agentDir,
      settingsManager,
      resourceLoader: loader,
      sessionManager: host.SessionManager.inMemory(),
      noTools: "builtin",
    });
    let removeErrorListener;
    try {
      await session.bindExtensions({ mode: "rpc" });
      const runner = session._extensionRunner;
      assert.ok(runner, "Pi host exposes the extension runner");
      // Pin the real host message the facade must recognize.
      assert.equal(runner.createContext().mode, "rpc");
      const runtimeErrors = [];
      removeErrorListener = runner.onError((error) => runtimeErrors.push(String(error?.error ?? error)));
      runner.invalidate();
      assert.throws(
        () => runner.createContext().mode,
        /stale after session replacement/,
        "real Pi 1.1 invalidation uses the recognized message",
      );
      // Before the stale-ctx adaptation every handler below threw the real Pi
      // 1.1 stale message from the preliminary ctx.mode read; the host recorded
      // that as an extension runtime error.
      await runner.emit({ type: "session_compact" });
      await runner.emit({ type: "session_tree" });
      await runner.emit({ type: "session_start", reason: "startup" });
      await runner.emit({ type: "agent_start" });
      await runner.emit({ type: "tool_execution_end", toolName: "todo", isError: false });
      await runner.emit({ type: "session_shutdown", reason: "quit" });
      assert.deepEqual(runtimeErrors, []);
    } finally {
      removeErrorListener?.();
      session.dispose();
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

/** Resolve with the observable settlement of `promise` within a deadline so a
 * wrapper that never settles fails fast instead of hanging the test. */
function settleWithin(promise, ms = 5000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("promise did not settle")), ms);
  });
  return Promise.race([
    promise.then(
      (value) => ({ status: "fulfilled", value }),
      (error) => ({ status: "rejected", error }),
    ),
    timeout,
  ]).finally(() => clearTimeout(timer));
}

test("settles the real /todos command on a stale Pi 1.1 command ctx and propagates unrelated async failures", async () => {
  const env = createIsolatedEnvironment({ prefix: "rpiv-todo-lean-stale-command-host-" });
  const previousEnv = {
    PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
    PI_CODING_AGENT_SESSION_DIR: process.env.PI_CODING_AGENT_SESSION_DIR,
    HOME: process.env.HOME,
  };
  const previousCwd = process.cwd();
  const unhandledRejections = [];
  const onUnhandledRejection = (reason) => unhandledRejections.push(reason);
  process.on("unhandledRejection", onUnhandledRejection);
  try {
    process.chdir(env.cwd);
    Object.assign(process.env, isolatedEnvironmentVariables(env));
    const host = await import(pathToFileURL(resolveHostModulePath({ requireFrom: import.meta.url })).href);
    const extensionEntry = resolve(dirname(fileURLToPath(import.meta.url)), "../index.ts");
    const settingsManager = host.SettingsManager.create(env.cwd, env.agentDir);
    const loader = new host.DefaultResourceLoader({
      cwd: env.cwd,
      agentDir: env.agentDir,
      settingsManager,
      additionalExtensionPaths: [extensionEntry],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const { session } = await host.createAgentSession({
      cwd: env.cwd,
      agentDir: env.agentDir,
      settingsManager,
      resourceLoader: loader,
      sessionManager: host.SessionManager.inMemory(),
      noTools: "builtin",
    });
    try {
      await session.bindExtensions({ mode: "rpc" });
      const runner = session._extensionRunner;
      const command = runner.getCommand("todos");
      assert.ok(command, "the lean facade registered the real /todos command");
      const staleCommandCtx = runner.createCommandContext();

      // An unrelated async upstream failure must reject the awaited wrapper
      // promise instead of becoming an unhandled rejection.
      const unusual = new Error("unexpected notify failure");
      const throwingUiCtx = {
        mode: "rpc",
        hasUI: false,
        ui: { notify() { throw unusual; } },
      };
      const rejected = command.handler("", throwingUiCtx);
      assert.ok(rejected && typeof rejected.then === "function", "the wrapped /todos handler is async");
      const rejection = await settleWithin(rejected);
      assert.equal(rejection.status, "rejected");
      assert.equal(rejection.error, unusual);

      // A genuinely invalidated Pi 1.1 command ctx must settle (resolve) while
      // swallowing only the recognized stale error.
      runner.invalidate();
      const settled = command.handler("", staleCommandCtx);
      assert.ok(settled && typeof settled.then === "function", "the wrapped /todos handler is async");
      const settlement = await settleWithin(settled);
      assert.deepEqual(settlement, { status: "fulfilled", value: undefined });

      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(unhandledRejections, []);
    } finally {
      session.dispose();
    }
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
    process.chdir(previousCwd);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    env.cleanup();
  }
});
