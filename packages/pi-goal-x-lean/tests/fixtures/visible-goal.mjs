import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { openHost, facadePath, goalNames, textOf } from "./host-session.mjs";

const scenario = process.argv[2];
const sdk = await import(pathToFileURL(process.env.PI_CODING_AGENT_MODULE));
const modelRuntime = await sdk.ModelRuntime.create({ modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
let nextBatch;
const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
modelRuntime.registerProvider("fixture", { api: "openai-completions", baseUrl: "https://unused.invalid", models: [
  { id: "goal-test", name: "Goal test", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 2048, cost },
], streamSimple(model, context) {
  const declared = new Set();
  for (const message of context.messages.filter(message => message.role === "system")) {
    for (const tool of message.toolsRemoved ?? []) declared.delete(tool.name);
    for (const tool of message.toolsAdded ?? []) declared.add(tool.name);
  }
  assert.deepEqual([...declared].filter(name => [...goalNames, "goal"].includes(name)).sort(),
    ["get_goal", "goal"], "provider sees only the two public goal tools");
  const batch = nextBatch;
  nextBatch = undefined;
  const message = { role: "assistant", api: model.api, provider: model.provider, model: model.id,
    content: batch ?? [{ type: "text", text: "Yield." }], stopReason: batch ? "toolUse" : "stop", timestamp: Date.now(),
    usage: { ...cost, totalTokens: 0, cost: { ...cost, total: 0 } } };
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => stream.push({ type: "done", reason: message.stopReason, message }));
  return stream;
} });
await modelRuntime.setRuntimeApiKey("fixture", "test");
const paths = [scenario === "audit-hold" ? fileURLToPath(new URL("./auditor.ts", import.meta.url)) : facadePath];
const outcomes = [];
const open = async sessionManager => {
  const opened = await openHost(paths, { hostVersions: ["1.7.0"], sessionManager,
    sessionOptions: { modelRuntime, model: modelRuntime.getModel("fixture", "goal-test") } });
  opened.session.subscribe(event => {
    if (event.type === "tool_execution_end" && !event.parentToolCallId) outcomes.push(event);
  });
  return opened;
};
let host = await open(scenario === "draft-history"
  ? sdk.SessionManager.create(process.cwd(), process.env.PI_CODING_AGENT_SESSION_DIR) : undefined);
const call = (name, args) => ({ type: "toolCall", id: `call_${randomUUID()}`, name, arguments: args });
const goal = (op, input) => call("goal", { op, input: JSON.stringify(input) });
const goalHelp = topic => call("goal", { op: "help", ...(topic === undefined ? {} : { input: topic }) });
async function draftCommand(name, seed) {
  // The command dispatches its drafting prompt asynchronously. Subscribe before
  // starting it so a fast offline response cannot race the next user turn.
  const settled = new Promise(resolve => {
    const unsubscribe = host.session.subscribe(event => {
      if (event.type === "agent_settled") { unsubscribe(); resolve(); }
    });
  });
  await host.command(name, seed);
  await settled;
}
async function batch(...calls) {
  nextBatch = calls;
  await host.session.prompt("Run the requested fixture operation.");
  return calls.map(({ id }) => {
    const result = host.session.messages.find(message => message.role === "toolResult" && message.toolCallId === id);
    assert.ok(result, `missing result for ${id}: ${host.session.messages.at(-1)?.errorMessage ?? host.session.getLastAssistantText()}`);
    return result;
  });
}
async function invoke(op, input, error) {
  const [result] = await batch(goal(op, input));
  assert.equal(result.isError, Boolean(error), textOf(result));
  if (error) assert.match(textOf(result), error);
  const [nested] = result.nestedCalls.calls;
  assert.equal(nested.name, op);
  assert.equal(nested.id, `${result.toolCallId}/1`);
  assert.equal(nested.status, error ? "error" : "ok");
  return result;
}
const outcomeOf = result => {
  const outcome = outcomes.find(event => event.toolCallId === result.toolCallId);
  assert.ok(outcome, `missing provider-level outcome for ${result.toolCallId}`);
  return outcome.result;
};

try {
  if (scenario === "disabled-tasks") {
    assert.equal(process.env.PI_GOAL_DISABLE_TASKS, "true", "the disabled-tasks scenario must pass its setting explicitly");
    await invoke("create_goal", { objective: "Disabled task fixture" });
    for (const [op, input] of [["set_goal_tasks", { tasks: [{ id: "one", title: "One" }] }],
      ["update_goal_task", { task_id: "one", status: "complete" }]]) {
      const [result] = await batch(goal(op, input));
      assert.equal(result.isError, true, textOf(result));
      assert.match(textOf(result), /disabled|inactive|unavailable|not available|unknown tool/i);
      assert.equal(result.nestedCalls, undefined, "inactive operations are rejected before execution");
    }
    const [help] = await batch(goalHelp("set_goal_tasks"));
    assert.equal(help.isError, true, textOf(help));
    assert.match(textOf(help), /inactive|unavailable/i);
    const declared = host.session.getActiveToolNames().map(name => ({ name }));
    const loadout = host.tool("goal").prepareLoadout({ declared });
    assert.deepEqual(loadout.hiddenDeclarations.sort(),
      ["create_goal", "goal_questionnaire", "propose_goal_draft", "update_goal"]);
    assert.doesNotMatch(loadout.descriptions.goal, /set_goal_tasks|update_goal_task/);
    const [read] = await batch(call("get_goal", {}));
    assert.ok(!read.details.goal.taskList);
  } else if (scenario === "router-errors") {
    await invoke("create_goal", { objective: "Router error fixture" });
    await invoke("update_goal", { status: "paused" }, /reason/i);
    const [schema] = await batch(goal("create_goal", {}));
    assert.equal(schema.isError, true, textOf(schema));
    assert.match(textOf(schema), /objective|missing|required/i);
    assert.equal(schema.nestedCalls.calls[0].status, "error");
    for (const [input, pattern] of [[{ op: "create_goal", input: "{" }, /Invalid JSON/i],
      [{ op: "missing_operation", input: "{}" }, /Unknown or unavailable/i]]) {
      const [result] = await batch(call("goal", input));
      assert.equal(result.isError, true, textOf(result));
      assert.match(textOf(result), pattern);
      assert.equal(result.nestedCalls, undefined, "wrapper errors do not execute a nested tool");
    }
    const [unknownHelp] = await batch(goalHelp("missing_operation"));
    assert.equal(unknownHelp.isError, true, textOf(unknownHelp));
    assert.match(textOf(unknownHelp), /Unknown or inactive goal help topic/i);
    const [directHelp] = await batch(goalHelp("get_goal"));
    assert.equal(directHelp.isError, false, textOf(directHelp));
    assert.match(textOf(directHelp), /Example: get_goal/);
  } else if (scenario === "op-parity") {
    const created = await invoke("create_goal", { objective: "Seven operation parity fixture" });
    const routedRead = await invoke("get_goal", {});
    assert.equal(routedRead.details.goal.id, created.details.goal.id);
    assert.equal(outcomeOf(created).terminate, true, "create_goal termination survives the router");
    const [read] = await batch(call("get_goal", {}));
    assert.equal(read.toolName, "get_goal");
    assert.equal(read.details.goal.id, created.details.goal.id);
    const tasks = await invoke("set_goal_tasks", { tasks: [{ id: "one", title: "One milestone" }] });
    assert.equal(outcomeOf(tasks).terminate, true, "set_goal_tasks confirmation termination survives the router");
    assert.equal(tasks.details.goal.taskList.tasks[0].id, "one");
    const task = await invoke("update_goal_task", { task_id: "one", status: "complete", evidence: "Checked" });
    assert.equal(task.details.goal.taskList.tasks[0].evidence, "Checked");
    const paused = await invoke("update_goal", { status: "paused", reason: "Parity review" });
    assert.equal(paused.details.goal.status, "paused");
    await draftCommand("goal", "Parity drafting fixture");
    const questions = await invoke("goal_questionnaire", { questions: [{ question: "Which format?", options: ["CSV", "JSON"] }] });
    assert.match(textOf(questions), /cancelled/i);
    const proposed = await invoke("propose_goal_draft", { objective: "Parity confirmed objective" });
    assert.equal(proposed.details.goal.objective, "Parity confirmed objective");
    assert.equal(outcomeOf(proposed).terminate, true, "proposal confirmation termination survives the router");
  } else if (scenario === "stage-guidance") {
    const disabled = process.env.PI_GOAL_DISABLE_TASKS === "true";
    const guidance = async () => {
      const handler = host.extensions[0].handlers.get("before_agent_start")?.at(-1);
      assert.equal(typeof handler, "function");
      const event = { type: "before_agent_start", systemPromptOptions: { sections: {} } };
      await handler(event, host.runner.createContext());
      return event.systemPromptOptions.sections.goal_operations;
    };
    assert.equal(await guidance(), undefined, "no goal guidance before a goal or draft exists");
    await invoke("create_goal", { objective: "Guidance fixture" });
    let text = await guidance();
    assert.match(text, /get_goal directly/);
    assert.match(text, /goal with op update_goal/);
    assert.equal(text.includes("op set_goal_tasks"), !disabled);
    assert.equal(text.includes("update_goal_task"), !disabled);
    if (!disabled) assert.match(text, /confirmation stops the turn/);
    await invoke("update_goal", { status: "paused", reason: "Guidance review" });
    text = await guidance();
    assert.match(text, /goal with op update_goal/);
    assert.ok(!text.includes("set_goal_tasks"));
    assert.ok(!text.includes("update_goal_task"));
    await draftCommand("goal", "Guidance drafting fixture");
    text = await guidance();
    assert.match(text, /Draft:/);
    assert.match(text, /propose_goal_draft to open confirmation/);
    assert.equal(text.includes("Task tracking is disabled"), disabled);
  } else if (scenario === "audit-hold") {
    await invoke("create_goal", { objective: "Auditor seam fixture visible facade" });
    const id = `call_${randomUUID()}`;
    await host.runner.emit({ type: "tool_execution_start", toolCallId: id, toolName: "subagent", args: { op: "run" } });
    await host.runner.emit({ type: "tool_execution_end", toolCallId: id, toolName: "subagent", isError: false,
      result: { content: [], details: { status: "background", agentId: "pending-child" } } });
    await invoke("update_goal", { status: "complete" }, /delegated work is pending/i);
    await host.runner.emit({ type: "message_start", message: { role: "custom", customType: "subagent-notification",
      content: "Result delivered", details: { id: "pending-child" } } });
    const rejected = await invoke("update_goal", { status: "complete" });
    assert.match(textOf(rejected), /Fixture rejection/);
    assert.equal(rejected.details.goal.status, "active");
    const approved = await invoke("update_goal", { status: "complete" });
    assert.match(textOf(approved), /Fixture approval/);
    assert.equal(approved.details.goal.status, "complete");
  } else {
    assert.equal(scenario, "draft-history");
    await invoke("create_goal", { token_budget: -1 }, /objective|token_budget/);
    await draftCommand("goal", "Draft a fixture objective");
    await invoke("create_goal", { objective: "Must remain a draft" }, /draft is in progress/i);
    const created = await invoke("propose_goal_draft", { objective: "Confirmed fixture objective", token_budget: 10000 });
    assert.equal(created.details.goal.objective, "Confirmed fixture objective");
    await draftCommand("goal-tweak", "Revise the fixture objective");
    const sessionFile = host.session.sessionManager.getSessionFile();
    await host.close();
    host = await open(sdk.SessionManager.open(sessionFile));
    const tweaked = await invoke("propose_goal_draft", { objective: "Confirmed revised fixture objective" });
    assert.equal(tweaked.details.goal.id, created.details.goal.id);
    assert.equal(tweaked.details.goal.objective, "Confirmed revised fixture objective");
    assert.equal(tweaked.details.goal.tokenBudget, 10000);
    const [pause, read, stale] = await batch(goal("update_goal", { status: "paused", reason: "Review revision" }),
      call("get_goal", { section: "objective" }), goal("create_goal", { objective: "Stale write" }));
    assert.equal(pause.details.goal.status, "paused");
    assert.equal(read.isError, false, textOf(read));
    assert.match(read.details.page.content, /Confirmed revised fixture objective/);
    assert.equal(stale.isError, true, textOf(stale));
    assert.match(textOf(stale), /already stopped/i);
    await host.close();
    host = await open(sdk.SessionManager.open(sessionFile));
    const previousPause = host.session.messages.find(message => message.role === "toolResult" && message.toolCallId === pause.toolCallId);
    assert.equal(previousPause.toolName, "goal");
    assert.deepEqual(previousPause.nestedCalls, pause.nestedCalls);
    const previousRead = host.session.messages.find(message => message.role === "toolResult" && message.toolCallId === read.toolCallId);
    assert.equal(previousRead.toolName, "get_goal");
    assert.equal(previousRead.details.page.content, read.details.page.content);
    const [restored] = await batch(call("get_goal", { section: "history" }));
    assert.equal(restored.details.goal.id, created.details.goal.id);
    assert.equal(restored.details.goal.pauseReason, "Review revision");
    assert.match(restored.details.page.content, /tweak/i);
  }
} finally { await host.close(); }
