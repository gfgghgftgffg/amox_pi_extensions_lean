import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import {
  createIsolatedEnvironment,
  isolatedEnvironmentVariables,
  resolveHostModulePath,
} from "../../../scripts/lib/isolated-pi-session.mjs";

const contextKey = Symbol.for("@gfgghgftgffg/pi-subagents-lean.context.v1");
const registerKey = Symbol.for("@gfgghgftgffg/pi-subagents-lean.context.register.v1");
const managerKey = Symbol.for("pi-subagents:manager");
const facadePath = fileURLToPath(new URL("../index.ts", import.meta.url));
const integrationPath = fileURLToPath(new URL("../../pi-goal-x-lean/integration.ts", import.meta.url));
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { isSubagentChild } = await jiti.import(integrationPath);

function restoreGlobal(key, previous) {
  if (previous === undefined) delete globalThis[key];
  else globalThis[key] = previous;
}

test("optional child-context reader checks the service at call time", () => {
  const previous = globalThis[contextKey];
  const previousManager = globalThis[managerKey];
  try {
    delete globalThis[contextKey];
    delete globalThis[managerKey];
    assert.equal(isSubagentChild(), false);
    for (const candidate of [null, true, {}, { version: 2, isChildSession: () => true }, { version: 1, isChildSession: true }]) {
      globalThis[contextKey] = candidate;
      assert.equal(isSubagentChild(), false);
    }
    globalThis[managerKey] = {};
    for (const candidate of [undefined, { version: 2, isChildSession: () => true }, { version: 1 }]) {
      globalThis[contextKey] = candidate;
      assert.throws(isSubagentChild, /pi-subagents manager.*child-context v1.*upgrade.*pi-subagents-lean.*0\.1\.19/);
    }
    globalThis[contextKey] = { version: 1, isChildSession: () => true };
    assert.equal(isSubagentChild(), true);
    globalThis[contextKey] = { version: 1, isChildSession: () => false };
    assert.equal(isSubagentChild(), false);
  } finally {
    restoreGlobal(contextKey, previous);
    restoreGlobal(managerKey, previousManager);
  }
});

test("checker registry deduplicates functions and prunes weak references on query and activation", async () => {
  const { createSubagentsFacade } = await jiti.import(facadePath);
  const facade = createSubagentsFacade(() => {});
  const previous = globalThis[contextKey];
  const NativeWeakRef = globalThis.WeakRef;
  const refs = [];
  class TrackedWeakRef extends NativeWeakRef {
    calls = 0;
    expired = false;
    constructor(target) {
      super(target);
      refs.push(this);
    }
    deref() {
      this.calls++;
      return this.expired ? undefined : super.deref();
    }
  }
  let oldChild = true;
  const oldChecker = () => oldChild;
  const previousDirectService = Object.freeze({ version: 1, isChildSession: oldChecker });
  try {
    // Hot-reloading the former single-checker v1 service must retain its runner.
    globalThis[contextKey] = previousDirectService;
    globalThis.WeakRef = TrackedWeakRef;
    facade({ registerTool() {} });
    const service = globalThis[contextKey];
    assert.notEqual(service, previousDirectService);
    assert.equal(service.version, 1);
    assert.equal(Object.isFrozen(service), true);
    assert.deepEqual(Object.keys(service).sort(), ["isChildSession", "version"]);
    assert.equal(refs.length, 2, "old and current dist checkers are held weakly");
    assert.equal(service.isChildSession(), true);
    oldChild = false;
    assert.equal(service.isChildSession(), false);
    facade({ registerTool() {} });
    service[registerKey](oldChecker);
    assert.equal(globalThis[contextKey], service);
    assert.equal(refs.length, 2, "repeated activation and same function do not add refs");

    refs[0].expired = true;
    assert.equal(service.isChildSession(), false);
    const queryPrunedCalls = refs[0].calls;
    service.isChildSession();
    assert.equal(refs[0].calls, queryPrunedCalls, "query removes expired refs");

    const activeChecker = () => true;
    service[registerKey](activeChecker);
    assert.equal(service.isChildSession(), true);
    refs[2].expired = true;
    facade({ registerTool() {} });
    const registrationPrunedCalls = refs[2].calls;
    assert.equal(service.isChildSession(), false);
    assert.equal(refs[2].calls, registrationPrunedCalls, "activation prunes expired refs even when its checker is already registered");
    assert.equal(refs.length, 3);

    refs[1].expired = true;
    service.isChildSession();
    facade({ registerTool() {} });
    assert.equal(refs.length, 4, "every activation registers the current dist checker");
  } finally {
    globalThis.WeakRef = NativeWeakRef;
    restoreGlobal(contextKey, previous);
  }
});

test("real Pi loader preserves child markers across same cwd, cross cwd and cache-clearing reload", { timeout: 120_000 }, async (t) => {
  const hostPath = resolveHostModulePath({ requireFrom: import.meta.url });
  const env = createIsolatedEnvironment({ prefix: "amox-subagents-context-" });
  const otherCwd = join(env.root, "other-cwd");
  mkdirSync(otherCwd);
  const previousCwd = process.cwd();
  const variables = isolatedEnvironmentVariables(env);
  const previousEnv = Object.fromEntries(Object.keys(variables).map((key) => [key, process.env[key]]));
  const previousService = globalThis[contextKey];
  const previousManager = globalThis[managerKey];
  const childEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("PI_SUBAGENT_")));
  const originalChildEnv = childEnv();
  mkdirSync(join(env.agentDir, "extensions"));
  const probePath = join(env.agentDir, "extensions", "z-context-probe.ts");
  const driverPath = join(env.agentDir, "extensions", "a-subagents-driver.ts");
  const observationsKey = Symbol.for("amox.test.subagents-context-observations");
  const previousObservations = globalThis[observationsKey];
  globalThis[observationsKey] = [];
  const driverKey = Symbol.for("amox.test.subagents-context-driver");
  const previousDriver = globalThis[driverKey];
  const require = createRequire(import.meta.url);
  // Import alongside the facade in the Pi loader's real module graph, just as
  // dist index.js and agent-runner.js import their adjacent child-context.js.
  writeFileSync(driverPath, `
    import subagents from ${JSON.stringify(facadePath)};
    import { inChildSessionContext, runInChildSessionContext } from ${JSON.stringify(require.resolve("@tintinweb/pi-subagents/dist/child-context.js"))};
    import { runAgent } from ${JSON.stringify(require.resolve("@tintinweb/pi-subagents/dist/agent-runner.js"))};
    const driver = { inChildSessionContext, runInChildSessionContext, runAgent };
    export default function (pi) {
      globalThis[Symbol.for("amox.test.subagents-context-driver")] = driver;
      subagents(pi);
    }
  `);
  writeFileSync(probePath, `
    import { isSubagentChild } from ${JSON.stringify(integrationPath)};
    export default function (pi) {
      globalThis[Symbol.for("amox.test.subagents-context-observations")].push(isSubagentChild());
      pi.registerTool({
        name: "context_probe", label: "Context probe",
        description: isSubagentChild() ? "child" : "parent",
        parameters: { type: "object", properties: {} },
        async execute() { return { content: [] }; },
      });
    }
  `);
  try {
    delete globalThis[contextKey];
    delete globalThis[managerKey];
    Object.assign(process.env, variables);
    process.chdir(env.cwd);
    const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await import(pathToFileURL(hostPath).href);
    async function loadProbe(expected, cwd = env.cwd, existingLoader) {
      const settingsManager = SettingsManager.create(cwd, env.agentDir);
      const loader = existingLoader ?? new DefaultResourceLoader({
        cwd, agentDir: env.agentDir, settingsManager,
        noExtensions: true, additionalExtensionPaths: [driverPath, probePath],
        noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      });
      // Reusing an already-loaded real loader calls clearExtensionCache().
      await loader.reload();
      assert.deepEqual(loader.getExtensions().errors, []);
      const { session, extensionsResult } = await createAgentSession({
        cwd, agentDir: env.agentDir, settingsManager,
        resourceLoader: loader, sessionManager: SessionManager.inMemory(cwd), noTools: "builtin",
      });
      try {
        assert.deepEqual(extensionsResult.errors, []);
        assert.equal(session.getAllTools().find((tool) => tool.name === "context_probe")?.description, expected);
        return { loader, driver: globalThis[driverKey] };
      } finally { session.dispose(); }
    }

    const { driver: firstDriver } = await loadProbe("parent");
    const service = globalThis[contextKey];
    assert.equal(service.version, 1);
    assert.equal(Object.isFrozen(service), true);
    assert.deepEqual(Object.keys(service).sort(), ["isChildSession", "version"]);
    assert.equal(isSubagentChild(), false);

    async function concurrentParentAndChild(driver, cwd) {
      let release;
      const blocked = new Promise((resolve) => { release = resolve; });
      const child = driver.runInChildSessionContext(async () => {
        assert.equal(driver.inChildSessionContext(), true);
        assert.equal(isSubagentChild(), true);
        await blocked;
        await loadProbe("child", cwd);
        assert.equal(isSubagentChild(), true);
        assert.deepEqual(childEnv(), originalChildEnv);
      });
      try {
        assert.equal(driver.inChildSessionContext(), false);
        assert.equal(isSubagentChild(), false);
        await loadProbe("parent", cwd);
        assert.equal(isSubagentChild(), false);
        assert.deepEqual(childEnv(), originalChildEnv);
      } finally {
        release();
        await child;
      }
      assert.equal(isSubagentChild(), false);
      await assert.rejects(driver.runInChildSessionContext(async () => {
        assert.equal(isSubagentChild(), true);
        throw new Error("child load failed");
      }), /child load failed/);
      assert.equal(isSubagentChild(), false);
      assert.deepEqual(childEnv(), originalChildEnv);
    }

    async function realRunnerLoadsChild(driver, cwd) {
      // Stop the real runner at model resolution, after resource loading and
      // before it can create a model session or contact a provider.
      globalThis[observationsKey] = [];
      const stop = new Error("stop after runner resource loading");
      await assert.rejects(driver.runAgent({
        cwd,
        getSystemPrompt: () => "",
        isProjectTrusted: () => true,
        get model() { throw stop; },
      }, "general-purpose", "Not sent to a provider", {
        pi: { exec: async () => ({ code: 1, stdout: "", stderr: "" }) },
      }), (error) => error === stop);
      assert.deepEqual([...globalThis[observationsKey]], [true], "actual dist runner must load the probe as a child");
      assert.equal(isSubagentChild(), false);
      assert.deepEqual(childEnv(), originalChildEnv);
      return globalThis[driverKey];
    }

    await t.test("same cwd reuses the runner graph and isolates a concurrent parent", async () => {
      await concurrentParentAndChild(firstDriver, env.cwd);
      const sameDriver = await realRunnerLoadsChild(firstDriver, env.cwd);
      assert.equal(sameDriver, firstDriver, "same cwd uses the cached extension factory");
    });

    await t.test("cross-cwd regression: old runner marker survives loading a new module graph", async () => {
      const crossDriver = await realRunnerLoadsChild(firstDriver, otherCwd);
      assert.notEqual(crossDriver.inChildSessionContext, firstDriver.inChildSessionContext, "changing cwd really creates a separate dist ALS");
      assert.equal(globalThis[contextKey], service, "activation must retain the aggregate service");
      await concurrentParentAndChild(firstDriver, otherCwd);
      await concurrentParentAndChild(crossDriver, otherCwd);
      await realRunnerLoadsChild(crossDriver, otherCwd);
    });

    await t.test("cache-clearing reload recognizes both the new runner and retained old runners", async () => {
      const { loader, driver: beforeReload } = await loadProbe("parent", otherCwd);
      const { driver: reloadedDriver } = await loadProbe("parent", otherCwd, loader);
      assert.notEqual(reloadedDriver.inChildSessionContext, beforeReload.inChildSessionContext, "real loader.reload clears the factory/module graph cache");
      assert.equal(globalThis[contextKey], service);
      await realRunnerLoadsChild(reloadedDriver, otherCwd);
      for (const driver of [firstDriver, beforeReload, reloadedDriver]) {
        await concurrentParentAndChild(driver, otherCwd);
        await realRunnerLoadsChild(driver, otherCwd);
      }
    });
  } finally {
    process.chdir(previousCwd);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    restoreGlobal(contextKey, previousService);
    restoreGlobal(managerKey, previousManager);
    restoreGlobal(observationsKey, previousObservations);
    restoreGlobal(driverKey, previousDriver);
    env.cleanup();
  }
});
