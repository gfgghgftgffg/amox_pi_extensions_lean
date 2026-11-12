import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { Agent } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { Type } from "typebox";

const jiti = createJiti(import.meta.url, { moduleCache: true });
const root = fileURLToPath(new URL("../../", import.meta.url));
const { createDelegationGuard } = await jiti.import(join(root, "pi-goal-x-lean/delegation.ts"));
const upstream = fileURLToPath(new URL("../../../node_modules/", import.meta.url));
const { GoalScheduler } = await jiti.import(join(upstream, "pi-goal-x/extensions/goal-scheduler.ts"));
const { GoalRuntime } = await jiti.import(join(upstream, "pi-goal-x/extensions/goal-runtime.ts"));
const { newGoalScheduler } = await jiti.import(join(upstream, "pi-goal-x/extensions/goal-scheduler-state.ts"));
const { CompletionOutbox, NOTIFICATION_HOLD_MS } = await import("@tintinweb/pi-subagents/dist/completion-outbox.js");
const { AgentManager } = await import("@tintinweb/pi-subagents/dist/agent-manager.js");
const { GroupJoinManager } = await import("@tintinweb/pi-subagents/dist/group-join.js");
const { escapeXml } = await import("@tintinweb/pi-subagents/dist/xml.js");
const text = value => ({ content: [{ type: "text", text: value }] });
const fullResult = (id, status = "completed") => text(`Agent: ${id}\nType: Explore | Status: ${status} | Tool uses: 1 | Duration: 1s\nDescription: task\n\nFull result.`);
const notice = (id, others = []) => ({ role: "custom", customType: "subagent-notification", content: "result preview", details: { id, others: others.map(id => ({ id })) } });
const agentNotice = (...members) => ({ ...notice(members[0][0], members.slice(1).map(([id]) => id)),
  content: members.map(([id, call]) => `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>${escapeXml(call)}</tool-use-id>\n<status>Done</status>\n<result>preview</result>\n</task-notification>`).join("\n\n"),
});

// Use the REAL scheduler and runtime, including their authorization and timers.
// Only goal persistence/UI are in-memory: no replacement scheduler or allowances.
function harness(t, { attach = true, active = true } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "goal-delegation-"));
  mkdirSync(join(cwd, ".pi"));
  writeFileSync(join(cwd, ".pi/pi-goal-x-settings.json"), JSON.stringify({ maxAutonomousRuns: 5, strictExecutionContract: false, idleContinuationBackoff: false }));
  const handlers = new Map(), bus = new Map(), dispatches = [], warnings = [], executions = [];
  const pi = {
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      handlers.set(name, [...list, handler]);
      return () => handlers.set(name, handlers.get(name).filter(item => item !== handler));
    },
    events: {
      on(name, handler) { bus.set(name, handler); return () => bus.delete(name); },
      emit(name, event) { bus.get(name)?.(event); },
    },
  };
  let liveId = "session-a", held = false;
  const context = id => ({ cwd, sessionManager: { getSessionId: () => id }, ui: { notify: (...args) => warnings.push(args) },
    signal: new AbortController().signal, isIdle: () => true, hasPendingMessages: () => false });
  let ctx = context(liveId);
  const core = {
    pi, state: { goal: active ? { id: "goal-a", status: "active", autoContinue: true, usage: { tokensUsed: 0 },
      scheduler: { ...newGoalScheduler(liveId), phase: "ready", decision: { kind: "ready", purpose: "ready" } } } : null },
    interruption: { isHeld: () => held },
    reconcileFocusedGoalFromDisk: () => true, updateUI() {}, clearActiveAccounting() {},
    goalService: {
      flushForAudit: () => undefined, isTurnBuffered: () => false,
      apply(_ctx, { mutate }) {
        core.state.goal = mutate(structuredClone(core.state.goal));
        return { ok: true, goal: core.state.goal };
      },
    },
  };
  core.runtime = new GoalRuntime({
    authorize: ctx => core.scheduler.claim(ctx),
    getGoal: () => core.state.goal,
    isActionable: id => core.state.goal?.id === id && core.state.goal.status === "active" && core.state.goal.autoContinue,
    sendFollowUp: (content, details) => dispatches.push({ content, details }),
  });
  core.scheduler = new GoalScheduler(core);
  const guard = createDelegationGuard(pi, { currentSessionId: () => liveId });
  if (attach) assert.equal(guard.attach(core), true);
  const emit = (type, event = {}, eventCtx = ctx) => {
    for (const handler of handlers.get(type) ?? []) assert.equal(handler({ type, ...event }, eventCtx), undefined);
  };
  const original = { name: "update_goal", parameters: Type.Object({ status: Type.String() }), marker: {},
    async execute(...args) { executions.push({ receiver: this, args }); return text("original audit"); } };
  const tool = guard.wrapGoalTool(original);
  const complete = () => tool.execute("audit", { status: "complete" }, ctx.signal, undefined, ctx);
  const preflight = (toolCallId, toolName, input = {}) => {
    for (const handler of handlers.get("tool_call") ?? []) {
      const result = handler({ type: "tool_call", toolCallId, toolName, input }, ctx);
      if (result?.block) return result;
      assert.equal(result, undefined);
    }
  };
  const start = (toolCallId, toolName, args = {}) => emit("tool_execution_start", { toolCallId, toolName, args });
  const end = (toolCallId, toolName, result, isError = false, eventCtx = ctx) => emit("tool_execution_end", { toolCallId, toolName, result, isError }, eventCtx);
  emit("session_start");
  t.after(() => { core.scheduler.shutdown(); core.runtime.clearContinuationState(); rmSync(cwd, { recursive: true, force: true }); });
  return { pi, guard, core, handlers, dispatches, warnings, executions, tool, original, complete, context, emit, start, end, preflight,
    get ctx() { return ctx; }, get liveId() { return liveId; }, set liveId(id) { liveId = id; },
    set held(value) { held = value; },
    switchSession(id) { liveId = id; ctx = context(id); emit("session_start"); },
  };
}
async function runBatch(h, batch, tools, { order = [], preflight = true, afterToolCall, onEvent } = {}) {
  let requests = 0;
  const agent = new Agent({
    initialState: { model: { id: "offline", provider: "offline", api: "openai-completions", contextWindow: 10000, maxTokens: 1000 }, tools },
    toolExecution: "parallel",
    beforeToolCall: async ({ toolCall, args }) => {
      order.push(`preflight-${toolCall.id}`);
      return preflight ? h.preflight(toolCall.id, toolCall.name, args) : undefined;
    },
    afterToolCall,
    streamFn(model) {
      const first = requests++ === 0;
      const message = { role: "assistant", api: model.api, provider: model.provider, model: model.id,
        content: first ? batch : [{ type: "text", text: "yield" }], stopReason: first ? "toolUse" : "stop", timestamp: Date.now(),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => stream.push({ type: "done", reason: message.stopReason, message }));
      return stream;
    },
  });
  agent.subscribe(event => { h.emit(event.type, event); onEvent?.(event); });
  await agent.prompt("execute tool batch");
  return agent.state.messages.filter(message => message.role === "toolResult");
}

function blocked(h) {
  assert.throws(h.complete, /Cannot complete goal while delegated work is pending/);
  const state = structuredClone(h.core.state.goal.scheduler);
  h.core.scheduler.schedule(h.ctx);
  assert.equal(h.core.scheduler.claim(h.ctx), null);
  assert.deepEqual(h.core.state.goal.scheduler, state, "blocked schedule/claim spends neither run allowance nor wait checks");
}

test("pinned upstream debug seam attaches; wrappers are narrow and missing seams are explicit", async t => {
  const { default: goal } = await jiti.import(join(upstream, "pi-goal-x/extensions/goal.ts"));
  const manifest = JSON.parse(readFileSync(join(root, "../maintenance/manifest.json")));
  for (const [packageName, id] of [["pi-goal-x", "pi-goal-x-lean"], ["@tintinweb/pi-subagents", "pi-subagents-lean"]]) {
    assert.equal(JSON.parse(readFileSync(join(upstream, packageName, "package.json"))).version,
      manifest.packages.find(entry => entry.id === id).upstreamVersion);
  }
  const h = harness(t, { attach: false, active: false });
  const tools = [];
  Object.assign(h.pi, { registerTool: tool => tools.push(tool), registerCommand() {}, registerShortcut() {}, registerMessageRenderer() {} });
  goal(h.pi);
  assert.ok(h.pi._goalCore.scheduler instanceof GoalScheduler);
  const scheduler = h.pi._goalCore.scheduler;
  assert.equal(h.guard.attach(undefined), false);
  assert.equal(h.guard.attach({ scheduler: {} }), false);
  assert.equal(h.guard.attach(h.pi._goalCore), true);
  const wrappedSchedule = scheduler.schedule;
  assert.equal(h.guard.attach(h.pi._goalCore), true);
  assert.equal(scheduler.schedule, wrappedSchedule, "attachment is idempotent");
  assert.equal(h.guard.attach(h.core), false, "a guard cannot silently switch cores");
  for (const tool of tools) {
    const wrapped = h.guard.wrapGoalTool(tool);
    if (tool.name !== "update_goal") {
      assert.equal(wrapped, tool);
      assert.equal(wrapped.execute, tool.execute);
    } else {
      assert.notEqual(wrapped.execute, tool.execute);
      for (const key of Reflect.ownKeys(tool).filter(key => key !== "execute")) assert.equal(wrapped[key], tool[key]);
    }
  }
  scheduler.schedule(h.ctx); // no goal, no subagents: upstream no-op remains
  assert.equal(scheduler.claim(h.ctx), null);
  scheduler.shutdown();
});

test("workflow holds without any active Agent, through done, the 200ms outbox and send-before-delivery", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness(t);
  const { scheduler } = h.core;
  // A pre-existing 0ms continuation MUST reach the wrapped claim, not spend.
  scheduler.schedule(h.ctx);
  h.start("launch", "subagent", { op: "workflow", input: JSON.stringify({ script: "workflow source", run_in_background: false }) });
  blocked(h);
  t.mock.timers.tick(0);
  assert.equal(h.dispatches.length, 0);
  h.end("launch", "subagent", { ...text("started"), details: { taskId: "wf_parent" } });
  scheduler.settled(h.ctx);
  blocked(h);
  // None of these completion channels is proof of delivery to the parent.
  h.pi.events.emit("subagents:completed", { id: "wf_parent", status: "completed" });
  h.emit("agent_end", { messages: [] });
  h.emit("tool_result", { toolCallId: "launch", toolName: "subagent", details: { taskId: "wf_parent" } });
  const sent = [];
  const outbox = new CompletionOutbox(message => sent.push(message), () => false);
  t.after(() => outbox.dispose());
  assert.equal(NOTIFICATION_HOLD_MS, 200);
  outbox.add({ ids: ["wf_parent"], build: () => ({ content: "workflow result", details: { id: "wf_parent", status: "completed" } }) });
  t.mock.timers.tick(199);
  blocked(h);
  assert.equal(sent.length, 0);
  t.mock.timers.tick(1);
  assert.equal(sent.length, 1);
  blocked(h); // sendMessage/queued steer is still NOT message_start
  assert.equal(h.core.state.goal.scheduler.used, 0);
  assert.deepEqual(h.dispatches, []);

  // Native notification starts the parent; preserve scheduler takeover.
  scheduler.begin(h.ctx);
  const message = { role: "custom", customType: "subagent-notification", ...sent[0] };
  h.emit("message_start", { message });
  scheduler.message(h.ctx, message);
  h.emit("message_end", { message });
  await h.complete();
  assert.equal(h.core.state.goal.scheduler.phase, "idle");
  t.mock.timers.tick(0);
  assert.deepEqual(h.dispatches, [], "guard does not race native notification with a second turn");
  scheduler.settled(h.ctx);
  t.mock.timers.tick(0);
  assert.equal(h.dispatches.length, 1, "only the native post-model continuation dispatches");
  assert.equal(h.core.state.goal.scheduler.used, 1);
  assert.deepEqual(h.warnings, []);
});

test("early batched notifications retain delivered IDs and release only their members; resumed IDs block again", async t => {
  const h = harness(t);
  h.start("a", "SubagentWorkflow");
  h.start("b", "subagent", { op: "workflow", input: '{"name":"second"}' });
  h.start("c", "Agent", { run_in_background: false }); // may hand off mid-run
  h.start("d", "subagent", { op: "run", input: '{"run_in_background":true}' });
  const early = notice("unrelated", ["wf_a", "agent_c"]);
  h.emit("message_start", { message: early });
  h.emit("message_end", { message: early });
  h.end("a", "SubagentWorkflow", { details: { taskId: "wf_a" } });
  h.end("b", "subagent", { details: { taskId: "wf_b" } });
  h.end("c", "Agent", { details: { agentId: "agent_c", status: "background" } });
  h.end("d", "subagent", { details: { agentId: "agent_d", status: "background" } });
  h.pi.events.emit("subagents:completed", { id: "agent_d", status: "completed" });
  blocked(h);
  h.emit("message_end", { message: notice("wf_b", ["untracked"]) });
  blocked(h); // d was not in either batch
  h.emit("message_end", { message: notice("agent_d") });
  await h.complete(); // a/c never re-blocked when their launch tools returned
  h.start("resume", "subagent", { op: "run", input: '{"resume":"agent_d","run_in_background":true}' });
  h.end("resume", "subagent", { details: { agentId: "agent_d", status: "background" } });
  blocked(h);
  h.emit("message_start", { message: agentNotice(["agent_d", "resume"]) });
  await h.complete();
  // A terminal read before a resume is OLD, even if its tool_end is delayed
  // until after the resume starts. Correct the former bypass assertion.
  h.start("early-read", "get_subagent_result", { agent_id: "reused-id" });
  h.start("early-launch", "Agent", { resume: "reused-id", run_in_background: true });
  h.end("early-read", "get_subagent_result", fullResult("reused-id"));
  h.end("early-launch", "Agent", { details: { agentId: "reused-id", status: "background" } });
  blocked(h);
  h.emit("message_end", { message: agentNotice(["reused-id", "early-launch"]) });
  await h.complete();
  assert.deepEqual(h.dispatches, []);
});

test("real Pi batch plus in-memory queued resume: old reads and outbox cannot release the new run, in either end order", async t => {
  for (const readFirst of [true, false]) for (const readEndsFirst of [true, false]) for (const extraAwaits of [0, 3]) {
    const h = harness(t), order = [], ends = [];
    // Use the REAL manager's queue branch; no child runner, model or scheduler
    // substitute. A saturated background pool keeps the resumed run queued.
    const manager = new AgentManager(undefined, 1);
    t.after(() => manager.dispose());
    const record = { id: "A", type: "Explore", handle: "worker", status: "completed", result: "old result",
      isBackground: true, session: { messages: [] }, startedAt: 1, completedAt: 2 };
    manager.agents.set("A", record);
    manager.runningBackground = 1;
    h.start("old-launch", "Agent");
    h.end("old-launch", "Agent", { details: { agentId: "A", status: "background" } });
    const oldMessage = agentNotice(["A", "old-launch"]), sent = [];
    const outbox = new CompletionOutbox(message => sent.push(message), () => true);
    const deliverOld = () => {
      for (const message of sent.splice(0)) {
        h.emit("message_start", { message });
        h.emit("message_end", { message });
      }
    };
    t.after(() => outbox.dispose());
    outbox.add({ ids: ["A"], build: () => oldMessage });
    outbox.onTurnEnd("toolUse"); // sent to Pi's steer queue, not yet delivered
    assert.equal(sent.length, 1);
    const captured = Promise.withResolvers(), readEnded = Promise.withResolvers(), resumeEnded = Promise.withResolvers();
    const calls = [
      { type: "toolCall", id: "read", name: "get_subagent_result", arguments: { agent_id: "worker" } },
      { type: "toolCall", id: "resume", name: "Agent", arguments: { resume: "A", run_in_background: true } },
    ];
    const results = await runBatch(h, readFirst ? calls : calls.toReversed(), [
      { name: "get_subagent_result", description: "test", parameters: Type.Object({ agent_id: Type.String() }), execute() {
        assert.equal(record.status, "completed");
        order.push("execute-old-read");
        const result = fullResult(record.id, record.status);
        outbox.cancel(record.id); // native read cancellation cannot recall a sent steer
        captured.resolve();
        return result;
      } },
      { name: "Agent", description: "test", parameters: Type.Object({ resume: Type.String(), run_in_background: Type.Boolean() }), async execute() {
        // Even when resume preflights first, the old read can execute while the
        // launcher awaits. No generation is present in that read's answer.
        await captured.promise;
        order.push("execute-resume");
        const resumed = await manager.resume("A", "next round", undefined, { isBackground: true });
        assert.equal(resumed, record);
        assert.equal(record.status, "queued");
        assert.equal(record.result, undefined);
        for (let i = 0; i < extraAwaits; i++) await Promise.resolve();
        if (readEndsFirst) deliverOld(); // OLD notification before launch end
        return { ...text("queued"), details: { agentId: record.id, status: "background" } };
      } },
    ], {
      order,
      // Exercise ownership even when only execution events are supplied. The
      // production tool_call rejection is separately tested below.
      preflight: false,
      async afterToolCall({ toolCall }) {
        if (toolCall.id === (readEndsFirst ? "resume" : "read")) await (readEndsFirst ? readEnded : resumeEnded).promise;
        for (let i = 0; i < extraAwaits; i++) await Promise.resolve();
      },
      onEvent(event) {
        if (event.type !== "tool_execution_end") return;
        ends.push(event.toolCallId);
        (event.toolCallId === "read" ? readEnded : resumeEnded).resolve();
      },
    });
    assert.deepEqual(order, [...(readFirst ? ["preflight-read", "preflight-resume"] : ["preflight-resume", "preflight-read"]), "execute-old-read", "execute-resume"]);
    assert.deepEqual(ends, readEndsFirst ? ["read", "resume"] : ["resume", "read"]);
    assert.ok(results.every(result => !result.isError));
    assert.equal(record.status, "queued");
    blocked(h);
    deliverOld(); // OLD notification after launch end in the other ordering
    blocked(h);
    assert.equal(manager.abort("A"), true);
    h.start("new-read", "get_subagent_result", { agent_id: "worker" });
    h.end("new-read", "get_subagent_result", fullResult("A", "stopped"));
    await h.complete();
    assert.deepEqual(h.dispatches, []);
  }
});

test("Pi preflight explicitly refuses overlapping read/resume in both orders, for native and facade calls and aliases", async t => {
  for (const facade of [false, true]) for (const readFirst of [true, false]) {
    const h = harness(t), order = [];
    const name = facade ? "subagent" : undefined;
    const readArgs = facade ? { op: "result", agent_id: "worker-alias", input: '{"agent_id":"ignored"}' } : { agent_id: "worker-alias" };
    const resumeArgs = facade ? { op: "run", input: '{"resume":"A","run_in_background":true}' } : { resume: "A", run_in_background: true };
    const calls = [
      { type: "toolCall", id: "read", name: name ?? "get_subagent_result", arguments: readArgs },
      { type: "toolCall", id: "resume", name: name ?? "Agent", arguments: resumeArgs },
    ];
    const execute = async id => {
      order.push(`execute-${id}`);
      await Promise.resolve();
      return id === "read" ? fullResult("A") : { details: { agentId: "A", status: "background" } };
    };
    const tools = (facade ? ["subagent"] : ["get_subagent_result", "Agent"]).map(name => ({
      name, description: "test", parameters: Type.Object({}, { additionalProperties: true }), execute,
    }));
    const results = await runBatch(h, readFirst ? calls : calls.toReversed(), tools, { order });
    const [accepted, rejected] = readFirst ? ["read", "resume"] : ["resume", "read"];
    assert.deepEqual(order, [`preflight-${accepted}`, `preflight-${rejected}`, `execute-${accepted}`]);
    assert.equal(results.find(result => result.toolCallId === accepted).isError, false);
    const rejection = results.find(result => result.toolCallId === rejected);
    assert.equal(rejection.isError, true);
    assert.match(rejection.content[0].text, /Cannot overlap subagent result reads with Agent resume.*handle\/ID aliases/);
    if (!readFirst) {
      blocked(h);
      h.emit("message_end", { message: agentNotice(["A", "resume"]) });
    }
    await h.complete();
  }
});

test("resume notifications require their own tool-use-id, including early delivery and mixed others batches", async t => {
  for (const early of [true, false]) {
    const h = harness(t), a = "resume<&>", b = "resume-b";
    h.start(a, "Agent", { resume: "A", run_in_background: true });
    h.start(b, "subagent", { op: "run", input: '{"resume":"B","run_in_background":true}' });
    const old = agentNotice(["A", "old-a"], ["B", "old-b"]);
    const finishLaunches = () => {
      h.end(a, "Agent", { details: { agentId: "A", status: "background" } });
      h.end(b, "subagent", { details: { agentId: "B", status: "background" } });
    };
    if (!early) finishLaunches();
    h.emit("message_start", { message: old });
    h.emit("message_end", { message: old });
    blocked(h);
    // A genuine new notification is usable before OR after its launch returns.
    const mixed = agentNotice(["unrelated", "other"], ["A", a], ["B", "old-b"]);
    h.emit("message_start", { message: mixed });
    h.emit("message_end", { message: mixed });
    if (early) finishLaunches();
    blocked(h); // only A released
    h.emit("message_end", { message: notice("B") });
    blocked(h); // id-only has no evidence of which resume finished
    h.emit("message_end", { message: agentNotice(["unrelated", "other"], ["B", b]) });
    await h.complete();
    // A repeated old message_end cannot clear yet another resume of the ID.
    h.start("third", "Agent", { resume: "A" });
    h.end("third", "Agent", { details: { agentId: "A", status: "background" } });
    h.emit("message_end", { message: mixed });
    blocked(h);
    h.start("consume-third", "get_subagent_result", { agent_id: "A" });
    h.end("consume-third", "get_subagent_result", fullResult("A"));
    await h.complete();
    assert.deepEqual(h.dispatches, []);
  }
});

test("fresh launch early full results remain consumable in either return order, with extra awaits", async t => {
  for (const readFirst of [true, false]) for (const readEndsFirst of [true, false]) {
    const h = harness(t);
    const launchStart = () => h.start("fresh", "Agent");
    if (!readFirst) launchStart();
    h.start("read", "get_subagent_result", { agent_id: "fresh-handle" });
    if (readFirst) launchStart();
    const launchEnd = () => h.end("fresh", "Agent", { details: { agentId: "fresh-id", status: "background" } });
    if (!readEndsFirst) launchEnd();
    await Promise.resolve();
    h.end("read", "get_subagent_result", fullResult("fresh-id"));
    await Promise.resolve();
    if (readEndsFirst) launchEnd();
    await h.complete();
  }
});

test("focus/create cannot escape session-wide holds from another goal, in-flight or after return", async t => {
  const h = harness(t);
  h.start("writer", "subagent", { op: "workflow", input: '{"name":"workspace-writer"}' });
  const goalA = h.core.state.goal;
  h.core.state.goal = { ...structuredClone(goalA), id: "goal-b" }; // focus/create during startup
  blocked(h);
  h.end("writer", "subagent", { details: { taskId: "wf_goal_a" } });
  blocked(h);
  h.core.state.goal = goalA;
  blocked(h);
  h.core.state.goal = { ...structuredClone(goalA), id: "goal-c" };
  h.start("reader", "subagent", { op: "result", input: '{"agent_id":"other-goal-agent"}' });
  h.end("reader", "subagent", fullResult("unrelated"));
  blocked(h);
  h.emit("message_end", { message: notice("wf_goal_a") });
  await h.complete();
  assert.deepEqual(h.dispatches, []);
});

test("only full terminal result consumption releases holds, including real saved-result JSON input while paused", async t => {
  const h = harness(t);
  h.start("a", "Agent");
  h.end("a", "Agent", { details: { agentId: "agent_a", status: "background" } });
  h.start("b", "Agent");
  h.end("b", "Agent", { details: { agentId: "agent_b", status: "background" } });
  for (const [key, result, isError] of [
    ["running", fullResult("agent_a", "running"), false],
    ["queued", fullResult("agent_a", "queued"), false],
    ["missing", text('Agent not found: "agent_a".'), false],
    ["aborted-wait", fullResult("agent_a"), true],
  ]) {
    h.start(key, "get_subagent_result", { agent_id: "agent_a", wait: true });
    h.end(key, "get_subagent_result", result, isError);
    blocked(h);
  }
  // Use the published runtime's actual saved-record fallback, not just a
  // hand-written result fixture. It returns text with no structured details.
  const { createSubagentsFacade } = await jiti.import(join(root, "pi-subagents-lean/index.ts"));
  const tools = [], noop = () => undefined;
  createSubagentsFacade()(new Proxy({ registerTool: tool => tools.push(tool), events: { on: noop, emit: noop }, getFlag: noop }, {
    get: (target, key) => key in target ? target[key] : noop,
  }));
  const facade = tools.find(tool => tool.name === "subagent");
  const branch = ["agent_a", "agent_b"].map((id, index) => ({ type: "custom", customType: "subagents:record", data: {
    id, type: "Explore", description: "Saved output", status: "completed", result: "Complete saved result", startedAt: 1000, completedAt: 2000,
    handle: `handle-${index}`,
  } }));
  h.ctx.sessionManager.getBranch = () => branch;
  for (const [key, ref] of [["read-a", "handle-0"], ["read-b", "handle-1"]]) {
    if (key === "read-b") Object.assign(h.core.state.goal, { status: "paused", autoContinue: false });
    const args = { op: "result", input: JSON.stringify({ agent_id: ref, verbose: true }) };
    h.start(key, "subagent", args);
    const result = await facade.execute(key, args, undefined, undefined, h.ctx);
    assert.equal(result.details, undefined);
    assert.match(result.content[0].text, /Complete saved result/);
    h.end(key, "subagent", result);
    if (key === "read-a") blocked(h);
  }
  await h.complete();
  assert.equal(h.core.state.goal.status, "paused");
  assert.equal(h.core.state.goal.autoContinue, false);
  assert.equal(h.core.state.goal.scheduler.used, 0);
  assert.deepEqual(h.dispatches, []);
});

test("real Pi parallel batch preflights before execution; execute gate rejects same-batch workflow/complete", async t => {
  const h = harness(t);
  const order = [];
  const batch = [
    { type: "toolCall", id: "wf", name: "SubagentWorkflow", arguments: {} },
    { type: "toolCall", id: "complete", name: "update_goal", arguments: { status: "complete" } },
  ];
  const results = await runBatch(h, batch, [
    { name: "SubagentWorkflow", label: "Workflow", description: "test", parameters: Type.Object({}), async execute() {
      order.push("execute-workflow");
      // A real async launcher has not returned its parent task ID yet.
      await Promise.resolve();
      return { ...text("background"), details: { taskId: "wf_parallel" } };
    } },
    { ...h.tool, description: "test", execute: (...args) => h.tool.execute(...args, h.ctx) },
  ], { order });
  assert.deepEqual(order, ["preflight-wf", "preflight-complete", "execute-workflow"]);
  assert.equal(results.length, 2);
  assert.equal(results[0].isError, false);
  assert.equal(results[1].isError, true);
  assert.match(results[1].content[0].text, /delegated work is pending/);
  assert.deepEqual(h.executions, [], "auditor is never entered");
  blocked(h);
  assert.equal(h.handlers.has("tool_call"), true, "read/resume ambiguity is rejected at Pi preflight; complete is still gated at execute");
});

test("failed/foreground launches release placeholders; no active goal or no subagents preserves upstream behavior", async t => {
  const h = harness(t);
  h.start("bad", "SubagentWorkflow");
  blocked(h);
  h.end("bad", "SubagentWorkflow", text("invalid meta"));
  h.start("throw", "Agent");
  h.end("throw", "Agent", text("startup failed"), true);
  h.start("fg", "Agent", { run_in_background: false });
  h.end("fg", "Agent", { details: { agentId: "foreground", status: "completed", kind: "background" } });
  await h.complete();
  assert.equal(h.executions.at(-1).receiver, h.tool);
  const args = ["pause", { status: "paused", reason: "user" }, h.ctx.signal, () => {}, h.ctx];
  await h.tool.execute(...args);
  assert.deepEqual(h.executions.at(-1).args, args);
  const other = { name: "get_goal", execute() {} };
  assert.equal(h.guard.wrapGoalTool(other), other);

  const n = harness(t, { active: false });
  n.start("ordinary", "Agent", { run_in_background: true });
  n.end("ordinary", "Agent", { details: { agentId: "ordinary", status: "background" } });
  n.core.state.goal = structuredClone(h.core.state.goal);
  await n.complete(); // no active goal at launch => ordinary subagent not adopted
  // No subagents installed/emitted on this active goal: scheduler still works.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  h.core.scheduler.schedule(h.ctx);
  t.mock.timers.tick(0);
  assert.equal(h.dispatches.length, 1);
  assert.equal(h.core.state.goal.scheduler.used, 1);
  assert.deepEqual(h.warnings, []);
});

test("notifications never implicitly resume paused, aborted or interruption-held goals", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const mode of ["paused", "aborted", "held"]) {
    const h = harness(t);
    h.start("wf", "SubagentWorkflow");
    h.end("wf", "SubagentWorkflow", { details: { taskId: "wf_stopped" } });
    if (mode !== "held") Object.assign(h.core.state.goal, { status: "paused", autoContinue: false });
    if (mode === "aborted") h.ctx.signal = AbortSignal.abort();
    if (mode === "held") h.held = true;
    const goal = structuredClone(h.core.state.goal);
    h.emit("message_start", { message: notice("wf_stopped") });
    h.emit("message_end", { message: notice("wf_stopped") });
    h.core.scheduler.schedule(h.ctx);
    t.mock.timers.tick(1000);
    assert.deepEqual(h.core.state.goal, goal);
    assert.deepEqual(h.dispatches, []);
    await h.complete(); // hold cleared, not a lifecycle resume
  }
});

test("session cleanup and live session callback reject late events; facade state is independent", async t => {
  const h = harness(t), independent = harness(t);
  const launch = target => {
    target.start("same-call", "SubagentWorkflow");
    target.end("same-call", "SubagentWorkflow", { details: { taskId: "same-id" } });
  };
  launch(h); launch(independent);
  h.emit("message_end", { message: notice("same-id") });
  await h.complete();
  blocked(independent);
  launch(h);
  const old = h.ctx;
  h.switchSession("session-b");
  await h.complete(); // clears both known IDs and in-flight placeholders
  launch(h);
  h.emit("message_end", { message: notice("same-id") }, old);
  h.emit("session_shutdown", {}, old);
  blocked(h);
  h.liveId = "different-live-session";
  h.emit("message_end", { message: notice("same-id") });
  h.liveId = "session-b";
  blocked(h); // stale callback did not consume the hold
  h.emit("session_shutdown");
  await h.complete();
  h.emit("session_start");
  h.start("late", "SubagentWorkflow");
  h.emit("session_shutdown");
  h.emit("session_start");
  h.end("late", "SubagentWorkflow", { details: { taskId: "late-return" } });
  await h.complete();
  blocked(independent);
});

test("group join cannot release a resumed Agent still queued when an older group delivers", async t => {
  const h = harness(t);
  let message;
  const group = new GroupJoinManager(records => {
    message = agentNotice(...records.map(record => [record.id, record.toolCallId]));
    // The upstream group callback builds details from these same mutable records.
    message.details.status = records[0].status;
    message.details.others = records.slice(1).map(record => ({ id: record.id, status: record.status }));
  });
  t.after(() => group.dispose());
  group.registerGroup("old-group", ["agent-a", "agent-b"]);
  const previous = { id: "agent-a", toolCallId: "previous-run", status: "completed" };
  assert.equal(group.onAgentComplete(previous), "held");

  h.start("current-resume", "Agent", { resume: "agent-a", run_in_background: true });
  h.end("current-resume", "Agent", { details: { agentId: "agent-a", status: "background" } });
  Object.assign(previous, { toolCallId: "current-resume", status: "queued" });
  group.onAgentComplete({ id: "agent-b", toolCallId: "other-run", status: "completed" });
  assert.equal(message.details.status, "queued");
  h.emit("message_end", { message });
  blocked(h);
  message.details.status = "running";
  h.emit("message_end", { message });
  blocked(h);
  message.details.status = "completed";
  h.emit("message_end", { message });
  await h.complete();
});
