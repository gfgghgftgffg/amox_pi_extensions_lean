// Real-upstream compatibility tests: load the pinned @tintinweb/pi-subagents
// 0.20.0 runtime through the lean facade, inspect the schemas it actually
// registers, and execute one side-effect-free upstream tool path.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = mkdtempSync(join(tmpdir(), "pi-subagents-lean-upstream-"));
const agentDir = join(root, "agent");
const cwd = join(root, "cwd");
mkdirSync(agentDir, { recursive: true });
mkdirSync(cwd, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.chdir(cwd);

const jiti = createJiti(import.meta.url, { moduleCache: false });
const extensionModule = await jiti.import(fileURLToPath(new URL("../index.ts", import.meta.url)));

function makePi() {
  const tools = [];
  const noOp = () => undefined;
  return new Proxy({
    registerTool(tool) { tools.push(tool); },
    on: noOp,
    registerCommand: noOp,
    registerShortcut: noOp,
    registerMessageRenderer: noOp,
    registerFlag: noOp,
    getFlag: () => undefined,
    events: { on: noOp, emit: noOp },
  }, {
    get(target, property) {
      if (property === "tools") return tools;
      return property in target ? target[property] : noOp;
    },
  });
}

function loadFacade() {
  const pi = makePi();
  extensionModule.createSubagentsFacade()(pi);
  assert.deepEqual(pi.tools.map((tool) => tool.name), ["subagent"]);
  return pi.tools[0];
}

test("real upstream 0.20.0 Agent schema is exposed through help", async () => {
  const facade = loadFacade();
  const result = await facade.execute("help-run", { op: "help", input: "run" });
  const text = result.content[0].text;

  assert.match(text, /Agent/);
  for (const field of [
    "prompt",
    "description",
    "subagent_type",
    "name",
    "model",
    "thinking",
    "max_turns",
    "run_in_background",
    "resume",
    "isolated",
    "inherit_context",
    "isolation",
    "schedule",
  ]) {
    assert.match(text, new RegExp(`"${field}"`), `Agent help is missing ${field}`);
  }
});

test("real upstream 0.20.0 helper schemas are exposed through help", async () => {
  const facade = loadFacade();
  const help = async (input) => (await facade.execute(`help-${input}`, { op: "help", input })).content[0].text;

  const resultHelp = await help("result");
  assert.match(resultHelp, /get_subagent_result/);
  assert.match(resultHelp, /"wait"/);
  assert.match(resultHelp, /"verbose"/);

  const steerHelp = await help("steer");
  assert.match(steerHelp, /steer_subagent/);
  assert.match(steerHelp, /"message"/);

  const workflowHelp = await help("workflow");
  assert.match(workflowHelp, /SubagentWorkflow/);
  assert.match(workflowHelp, /"scriptPath"/);
  assert.match(workflowHelp, /"resumeFromRunId"/);
});

test("real upstream 0.20.0 Agent type list is parsed into the facade schema", () => {
  const facade = loadFacade();
  assert.equal(
    facade.parameters.properties.subagent_type.description,
    "Agent types at startup: general-purpose, Explore, Plan.",
  );
});

test("real upstream execute answers for an unknown agent without spawning", async () => {
  const facade = loadFacade();
  const result = await facade.execute(
    "call-result",
    { op: "result", agent_id: "missing-agent-id" },
    undefined,
    undefined,
    { cwd },
  );
  assert.match(result.content[0].text, /Agent not found/);
});

test("real upstream 0.20.0 schema rejects invalid routed parameters", async () => {
  const facade = loadFacade();
  await assert.rejects(
    facade.execute(
      "call-invalid",
      { op: "result", input: JSON.stringify({ wait: "not-a-boolean" }) },
      undefined,
      undefined,
      { cwd },
    ),
    /subagent result parameters are invalid/,
  );
});

test("real upstream 0.20.0 Agent schema constraints gate op=run before spawning", async () => {
  const facade = loadFacade();
  await assert.rejects(
    facade.execute(
      "call-run-invalid",
      {
        op: "run",
        prompt: "Never spawned",
        description: "invalid run",
        subagent_type: "Explore",
        input: JSON.stringify({ max_turns: 0 }),
      },
      undefined,
      undefined,
      { cwd },
    ),
    /subagent run parameters are invalid/,
  );
});
