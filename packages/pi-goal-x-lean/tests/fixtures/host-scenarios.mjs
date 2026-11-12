import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openHost, facadePath, upstreamPath, repoRoot, goalNames, initialProfile, activeProfile,
  taskProfile, pausedProfile, textOf, goalFile } from "./host-session.mjs";

const scenario = process.argv[2];
const json = value => JSON.parse(JSON.stringify(value));
function withoutAnnotations(schema) {
  // Independent contract projection: schema maps, scalar schemas and schema arrays.
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(withoutAnnotations);
  return Object.fromEntries(Object.entries(schema).flatMap(([key, value]) => {
    if (key === "description") return [];
    if (["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"].includes(key)) {
      return [[key, Object.fromEntries(Object.entries(value).map(([name, child]) => [name, withoutAnnotations(child)]))]];
    }
    return [[key, ["items", "additionalProperties", "unevaluatedProperties", "contains", "propertyNames", "not", "if", "then", "else",
      "allOf", "anyOf", "oneOf", "prefixItems"].includes(key) ? withoutAnnotations(value) : value]];
  }));
}
function poolFiles() {
  const root = process.env.PI_GOAL_ROOT;
  function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
      ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
  }
  return existsSync(root) ? walk(root) : [];
}
function ledgerEvents() {
  const ledgers = poolFiles().filter(path => path.endsWith(".jsonl"));
  assert.ok(ledgers.length > 0, "durable goal ledger exists");
  return ledgers.flatMap(path => readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)));
}
function snapshotPool() {
  return poolFiles().map(path => [path, readFileSync(path, "utf8")]);
}

if (scenario === "contracts") {
  const upstream = await openHost([upstreamPath]);
  let original, registrations;
  try {
    assert.deepEqual([...upstream.extensions[0].tools.keys()], goalNames);
    upstream.profile(initialProfile);
    const extension = upstream.extensions[0];
    registrations = Object.fromEntries(["commands", "shortcuts", "handlers", "messageRenderers"].map(key => [key, [...extension[key].keys()]]));
    original = goalNames.map(name => {
      const tool = upstream.tool(name);
      return { ...tool, parameters: json(tool.parameters) };
    });
  } finally { await upstream.close(); }
  const facade = await openHost([facadePath]);
  try {
    assert.deepEqual([...facade.extensions[0].tools.keys()], goalNames);
    facade.profile(initialProfile);
    let before = 0, after = 0;
    for (const tool of original) {
      const lean = facade.tool(tool.name);
      assert.deepEqual(json(lean.parameters), withoutAnnotations(tool.parameters), `${tool.name}: all SDK schema constraints retained`);
      assert.equal(lean.promptSnippet, "");
      assert.deepEqual(lean.promptGuidelines, tool.promptGuidelines);
      assert.equal(lean.executionMode, tool.executionMode);
      assert.equal(typeof lean.execute, "function");
      assert.equal(typeof lean.renderCall, "function");
      assert.equal(typeof lean.renderResult, "function");
      before += JSON.stringify(tool.parameters).length + tool.description.length + (tool.promptSnippet ?? "").length;
      after += JSON.stringify(lean.parameters).length + lean.description.length + lean.promptSnippet.length;
    }
    assert.ok(after < before, `metadata is smaller (${after} < ${before})`);
    const ext = facade.extensions[0];
    assert.ok(ext.commands.has("goal") && ext.commands.has("goal-refresh"));
    for (const [key, expected] of Object.entries(registrations)) {
      if (key === "handlers") {
        for (const name of expected) assert.ok(ext.handlers.has(name), `upstream hook ${name} is retained alongside delegation hooks`);
      } else {
        assert.deepEqual([...ext[key].keys()], expected, `${key} match the real upstream print-mode registrations`);
      }
    }
    assert.ok(ext.handlers.has("turn_end") && ext.handlers.has("session_start"));
    assert.ok(ext.messageRenderers.has("pi-goal-event") && ext.messageRenderers.has("pi-goal-audit-event"));
  } finally { await facade.close(); }
} else if (scenario === "lifecycle") {
  let host = await openHost([facadePath]);
  let expected, manager;
  try {
    host.profile(initialProfile);
    assert.equal((await host.execute("get_goal")).details.goal, null);
    const created = await host.execute("create_goal", { objective: "Isolated lifecycle fixture objective", token_budget: 5000 });
    assert.equal(created.terminate, true);
    assert.equal(created.details.goal.status, "active");
    assert.equal(created.details.goal.tokenBudget, 5000);
    assert.equal(created.details.goal.autoContinue, true);
    assert.ok(existsSync(goalFile(created.details.goal)));
    host.profile(activeProfile);
    const tasks = await host.execute("set_goal_tasks", { block_completion: true, tasks: [
      { id: "parent", title: "Parent milestone" },
      { id: "child", parent_id: "parent", title: "Child verification", verification_contract: "Targeted checks must pass" },
      { id: "other", title: "Independent milestone" },
    ] });
    assert.equal(tasks.terminate, true);
    assert.equal(tasks.details.goal.taskList.tasks[0].subtasks[0].id, "child");
    host.profile(taskProfile);
    let before = snapshotPool();
    const rejected = await host.execute("update_goal_task", { updates: [
      { task_id: "other", status: "complete" }, { task_id: "missing", status: "complete" },
    ] });
    assert.match(textOf(rejected), /missing|not found/i);
    assert.deepEqual(json(rejected.details.goal.taskList.tasks), json(tasks.details.goal.taskList.tasks), "invalid batch commits no prefix");
    assert.deepEqual(snapshotPool(), before, "invalid batch changes no goal/ledger/snapshot files");
    const gate = await host.execute("update_goal_task", { task_id: "child", status: "complete" });
    assert.match(textOf(gate), /verification contract.*evidence/i);
    assert.equal(gate.details.goal.taskList.tasks[0].subtasks[0].status, "pending");
    assert.deepEqual(snapshotPool(), before, "evidence rejection is also read-only");
    const ordered = await host.execute("update_goal_task", { updates: [
      { task_id: "child", status: "complete", evidence: "node --test: targeted checks passed" },
      { task_id: "parent", status: "complete" },
      { task_id: "other", status: "skipped", reason: "User explicitly removed this milestone" },
    ] });
    assert.match(textOf(ordered), /child complete; parent complete; other skipped/);
    const tree = ordered.details.goal.taskList.tasks;
    assert.equal(tree[0].status, "complete");
    assert.equal(tree[0].subtasks[0].evidence, "node --test: targeted checks passed");
    assert.equal(tree[1].status, "skipped");
    const batchEvents = ledgerEvents().filter(event => ["task_complete", "task_skipped"].includes(event.type));
    assert.deepEqual(batchEvents.map(event => [event.type, event.taskId]), [
      ["task_complete", "child"], ["task_complete", "parent"], ["task_skipped", "other"],
    ]);
    const paused = await host.execute("update_goal", { status: "paused", reason: "Waiting for user review" });
    assert.equal(paused.terminate, true);
    assert.equal(paused.details.goal.status, "paused");
    assert.equal(paused.details.goal.pauseReason, "Waiting for user review");
    host.profile(pausedProfile);
    const file = goalFile(paused.details.goal);
    assert.match(readFileSync(file, "utf8"), /Waiting for user review/);
    // Even with no external edits, the user-owned refresh must preserve state.
    await host.command("goal-refresh");
    const refreshed = await host.execute("get_goal");
    assert.equal(refreshed.details.goal.objective, "Isolated lifecycle fixture objective");
    assert.equal(refreshed.details.goal.status, "paused");
    assert.deepEqual(json(refreshed.details.goal.taskList.tasks), json(tree));
    assert.ok(ledgerEvents().some(event => event.type === "goal_paused" && event.goalId === paused.details.goal.id));
    expected = refreshed.details.goal;
    manager = host.session.sessionManager;
  } finally { await host.close(); }
  host = await openHost([facadePath], { sessionManager: manager });
  try {
    host.profile(pausedProfile);
    const restored = (await host.execute("get_goal")).details.goal;
    assert.equal(restored.id, expected.id);
    assert.equal(restored.status, "paused");
    assert.equal(restored.objective, expected.objective);
    assert.deepEqual(restored.taskList, expected.taskList);
    assert.equal(restored.pauseReason, expected.pauseReason);
  } finally { await host.close(); }
} else if (scenario === "refresh-external-edit-upstream-parity") {
  const entry = process.argv[3];
  assert.ok(["upstream", "facade"].includes(entry), "select the original or facade entry explicitly");
  const { version } = JSON.parse(readFileSync(join(repoRoot, "node_modules/pi-goal-x/package.json"), "utf8"));
  const host = await openHost([entry === "upstream" ? upstreamPath : facadePath]);
  try {
    const objective = "Isolated objective before external edit";
    const created = await host.execute("create_goal", { objective });
    await host.execute("update_goal", { status: "paused", reason: "External user review" });
    const file = goalFile(created.details.goal);
    const editedObjective = "Externally edited isolated lifecycle objective";
    const originalFile = readFileSync(file, "utf8");
    assert.ok(originalFile.includes(objective), "the real goal file initially contains the original objective");
    const editedFile = originalFile.replaceAll(objective, editedObjective);
    writeFileSync(file, editedFile);
    assert.equal(readFileSync(file, "utf8"), editedFile, "the external in-place edit reaches the real goal file");
    await host.command("goal-refresh");
    assert.equal(readFileSync(file, "utf8"), editedFile, "the real goal file is still edited after /goal-refresh");
    const refreshed = await host.execute("get_goal");
    const observation = {
      version,
      actual: refreshed.details.goal.objective,
      expected: editedObjective,
      goalFileEdited: readFileSync(file, "utf8") === editedFile,
      status: refreshed.details.goal.status,
      pauseReason: refreshed.details.goal.pauseReason,
      // Independent runs generate different IDs; all other returned content must match.
      content: json(refreshed.content).map(item => item.type === "text"
        ? { ...item, text: item.text.replaceAll(created.details.goal.id, "<goal-id>") } : item),
    };
    console.log(`goal-refresh upstream-parity observation: ${JSON.stringify(observation)}`);
    assert.equal(observation.goalFileEdited, true, "the actual/expected mismatch is not a failed or reverted disk edit");
    if (version === "0.34.1") {
      assert.notEqual(observation.actual, observation.expected,
        "pi-goal-x@0.34.1 snapshot limitation: /goal-refresh does NOT observe the edited objective");
      assert.equal(observation.actual, objective, "this pinned release serves the original objective from the stale snapshot");
    } else {
      assert.ok([objective, editedObjective].includes(observation.actual), "upstream refresh returns the persisted or externally edited objective");
    }
    assert.equal(observation.status, "paused");
  } finally { await host.close(); }
} else if (scenario === "cohost") {
  const paths = ["pi-web-access-lean", "rpiv-todo-lean", "pi-subagents-lean", "amox-pi-sync", "pi-goal-x-lean"]
    .map(name => join(repoRoot, "packages", name, "index.ts"));
  const host = await openHost(paths);
  try {
    assert.deepEqual(host.extensions.map(extension => extension.path).sort(), [...paths].sort());
    for (const name of ["web_access", "todo", "subagent"]) assert.ok(host.session.getActiveToolNames().includes(name));
    assert.ok(host.session.getAllTools().some(tool => tool.name === "read"));
    assert.ok(host.session.getAllTools().some(tool => tool.name === "write"));
    const ordinary = [...host.session.getActiveToolNames().filter(name => !goalNames.includes(name)), "read"];
    host.session.setActiveToolsByName([...ordinary, ...initialProfile]);
    // Deliberately select read but leave write disabled; goal profile changes must preserve both choices.
    host.profile(initialProfile, ordinary);
    await host.execute("create_goal", { objective: "Cohost profile fixture" });
    host.profile(activeProfile, ordinary);
    await host.execute("set_goal_tasks", { tasks: [{ id: "one", title: "One milestone" }] });
    host.profile(taskProfile, ordinary);
    await host.execute("update_goal", { status: "paused", reason: "User review" });
    host.profile(pausedProfile, ordinary);
    await host.command("goal-unfocus");
    host.profile(initialProfile, ordinary);
    assert.ok(host.runner.getCommand("sync-status"), "sync command remains installed");
  } finally { await host.close(); }
} else if (scenario === "auditor") {
  const entry = fileURLToPath(new URL("./auditor.ts", import.meta.url));
  const host = await openHost([entry]);
  try {
    const created = await host.execute("create_goal", { objective: "Auditor seam fixture objective" });
    // Deliver the pinned subagent event shape through the real host runner.
    // No model or replacement scheduler is needed to verify the facade wiring.
    await host.runner.emit({ type: "tool_execution_start", toolCallId: "pending-launch", toolName: "subagent", args: { op: "run" } });
    await host.runner.emit({ type: "tool_execution_end", toolCallId: "pending-launch", toolName: "subagent", isError: false,
      result: { content: [{ type: "text", text: "Background child started" }], details: { status: "background", agentId: "pending-child" } } });
    await assert.rejects(async () => host.tool("update_goal").execute("premature-complete", { status: "complete" },
      new AbortController().signal, () => {}, host.runner.createContext()), /Cannot complete goal while delegated work is pending/);
    assert.equal(ledgerEvents().filter(event => event.type === "completion_requested" || event.type === "audit_started").length, 0,
      "pending work is rejected before the upstream auditor runs");
    assert.equal((await host.execute("get_goal")).details.goal.status, "active");
    await host.runner.emit({ type: "message_start", message: { role: "custom", customType: "subagent-notification",
      content: "Background result delivered", details: { id: "pending-child" } } });
    const rejected = await host.execute("update_goal", { status: "complete" });
    assert.match(textOf(rejected), /completion rejected by independent auditor/);
    assert.match(textOf(rejected), /Fixture rejection/);
    assert.equal(rejected.details.goal.status, "active");
    assert.ok(existsSync(goalFile(created.details.goal)), "rejection leaves the active goal intact");
    const approved = await host.execute("update_goal", { status: "complete" });
    assert.equal(approved.details.goal.status, "complete");
    assert.equal(approved.terminate, true);
    assert.match(textOf(approved), /Fixture approval/);
    const events = ledgerEvents();
    assert.deepEqual(events.filter(event => event.type === "audit_result").map(event => event.verdict), ["disapproved", "approved"]);
    assert.equal(events.filter(event => event.type === "audit_started").length, 2);
    assert.equal(events.filter(event => event.type === "completion_requested").length, 2);
    assert.equal(events.filter(event => event.type === "audit_skipped").length, 0);
    assert.ok(events.some(event => event.type === "goal_completed" && event.goalId === created.details.goal.id));
    assert.ok(events.some(event => event.type === "goal_archived" && event.goalId === created.details.goal.id));
    assert.equal(existsSync(goalFile(created.details.goal)), false);
    assert.equal((await host.execute("get_goal")).details.goal, null);
    host.profile(initialProfile);
  } finally { await host.close(); }
} else {
  throw new Error(`Unknown goal host scenario: ${scenario}`);
}
console.log(`goal scenario passed: ${scenario}`);
