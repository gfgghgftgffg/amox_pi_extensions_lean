import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveHostModulePath } from "../../../../scripts/lib/isolated-pi-session.mjs";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const facadePath = join(repoRoot, "packages/pi-goal-x-lean/index.ts");
export const upstreamPath = join(repoRoot, "node_modules/pi-goal-x/extensions/goal.ts");
export const goalNames = ["get_goal", "create_goal", "update_goal", "set_goal_tasks", "update_goal_task",
  "goal_question", "goal_questionnaire", "propose_goal_draft"];
export const initialProfile = ["create_goal", "get_goal"];
export const activeProfile = ["create_goal", "get_goal", "update_goal", "set_goal_tasks"];
export const taskProfile = [...activeProfile, "update_goal_task"];
export const pausedProfile = activeProfile;

// These are actual SDK resources, extension loading, runtime binding and contexts.
// No alternate Type shim or fake ExtensionAPI is involved in integration checks.
export async function openHost(paths, { sessionManager } = {}) {
  const host = await import(pathToFileURL(resolveHostModulePath({ requireFrom: import.meta.url })).href);
  assert.ok(["1.4.0", "1.5.2"].includes(host.VERSION), `tested Pi SDK runtime pin: ${host.VERSION}`);
  const cwd = process.cwd(), agentDir = process.env.PI_CODING_AGENT_DIR;
  const settingsManager = host.SettingsManager.create(cwd, agentDir);
  const loader = new host.DefaultResourceLoader({
    cwd, agentDir, settingsManager, additionalExtensionPaths: paths,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, [], "real Pi loader diagnostics");
  const { session, extensionsResult } = await host.createAgentSession({
    cwd, agentDir, settingsManager, resourceLoader: loader,
    sessionManager: sessionManager ?? host.SessionManager.inMemory(), noTools: "builtin",
  });
  const errors = [];
  const removeErrorListener = session._extensionRunner.onError(error => errors.push(error));
  await session.bindExtensions({ mode: "print" });
  assert.deepEqual(errors, [], "real Pi binding diagnostics");
  const runner = session._extensionRunner;
  return {
    session, runner, extensions: extensionsResult.extensions, errors,
    tool(name) {
      const registrations = extensionsResult.extensions.flatMap(extension => [...extension.tools.values()]);
      const registration = registrations.find(tool => tool.definition.name === name);
      assert.ok(registration, `registered tool ${name}`);
      return registration.definition;
    },
    async execute(name, params = {}) {
      await runner.emit({ type: "turn_start", turnIndex: 0, timestamp: Date.now() });
      const result = await this.tool(name).execute(`test-${name}`, params, new AbortController().signal, () => {}, runner.createContext());
      // Synthetic turn boundaries exercise the installed persistence hooks without invoking a model.
      await runner.emit({ type: "turn_end", turnIndex: 0, toolResults: [], message: {
        role: "assistant", content: [], stopReason: "stop", timestamp: Date.now(),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
      } });
      assert.deepEqual(errors, [], `${name}: lifecycle diagnostics`);
      return result;
    },
    async command(name, args = "") {
      const command = runner.getCommand(name);
      assert.ok(command, `registered command ${name}`);
      return command.handler(args, runner.createCommandContext());
    },
    profile(expected, ordinary) {
      const active = session.getActiveToolNames();
      assert.deepEqual(active.filter(name => goalNames.includes(name)).sort(), [...expected].sort());
      if (ordinary) assert.deepEqual(active.filter(name => !goalNames.includes(name)).sort(), [...ordinary].sort());
      assert.ok(!session.getAllTools().some(tool => /goal2/i.test(tool.name)), "no goal2 tools");
    },
    async close() {
      try {
        await runner.emit({ type: "session_shutdown" });
        assert.deepEqual(errors, [], "no swallowed extension runtime errors");
      } finally {
        removeErrorListener();
        session.dispose();
      }
    },
  };
}

export const textOf = result => result.content.filter(item => item.type === "text").map(item => item.text).join("\n");
export function goalFile(goal) {
  assert.ok(goal.activePath?.startsWith(".pi/goals/"));
  return resolve(process.env.PI_GOAL_ROOT, goal.activePath.slice(".pi/goals/".length));
}
