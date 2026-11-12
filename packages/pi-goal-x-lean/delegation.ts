import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";

type Tool = ToolDefinition<any, any, any>;
type Goal = { id: string; status: string };
type Core = {
  state: { goal: Goal | null };
  scheduler: {
    schedule(ctx: ExtensionContext): void;
    claim(ctx: ExtensionContext): Record<string, unknown> | null;
  };
};
type Operation = "agent" | "workflow" | "result";
type Call = {
  operation: Operation;
  toolCallId: string;
  resume: boolean;
  delivered: Set<string>;
  // A result has no generation. It may release only these exact launches,
  // never a resume which reused their ID while the result was awaiting return.
  holds: Map<string, Call>;
  launches: Call[];
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function operation(name: string, args: unknown): Operation | undefined {
  if (name === "Agent") return "agent";
  if (name === "SubagentWorkflow") return "workflow";
  if (name === "get_subagent_result") return "result";
  if (name !== "subagent") return;
  // The facade routes on the outer op. JSON input supplies advanced parameters,
  // not the operation; direct fields override that JSON. Track every run, since
  // even a foreground Agent can be handed off to the background mid-execution.
  switch (record(args)?.op) {
    case "run": return "agent";
    case "workflow": return "workflow";
    case "result": return "result";
  }
}

function id(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parameters(name: string, args: unknown): Record<string, unknown> | undefined {
  const direct = record(args);
  if (name !== "subagent" || typeof direct?.input !== "string") return direct;
  try {
    return { ...record(JSON.parse(direct.input)), ...direct };
  } catch {
    return direct; // The facade rejects invalid input; do not invent a launch.
  }
}

function notificationCalls(content: unknown): Map<string, string> {
  // 0.23.2 snapshots each Agent's tool-use-id in the XML body, NOT details.
  // Batched messages contain one block per member; results are XML-escaped.
  const text = typeof content === "string" ? content : Array.isArray(content)
    ? content.map(record).filter(part => part?.type === "text").map(part => part?.text).join("\n") : "";
  const calls = new Map<string, string>();
  for (const match of text.matchAll(/<task-notification>\n<task-id>([^<\r\n]+)<\/task-id>\n<tool-use-id>([^<\r\n]+)<\/tool-use-id>\n/g)) {
    const unescape = (value: string) => value.replace(/&(amp|lt|gt);/g, (_, entity: string) =>
      ({ amp: "&", lt: "<", gt: ">" })[entity]!);
    calls.set(match[1], unescape(match[2]));
  }
  return calls;
}

function consumedId(result: unknown): string | undefined {
  // tintinweb 0.23.2 get_subagent_result returns NO structured details, even
  // for saved records/handle lookups. Only its anchored, terminal result header
  // proves consumption (running, queued, not-found and thrown waits do not).
  const content = record(result)?.content;
  if (!Array.isArray(content)) return;
  const first = record(content[0]);
  if (first?.type !== "text" || typeof first.text !== "string") return;
  return /^Agent: ([^\r\n]+)\nType: [^\r\n]* \| Status: (?:completed|steered|aborted|stopped|error)(?: \([^\r\n]*\))? \| /.exec(first.text)?.[1];
}

/**
 * Optional bridge for goal-x 0.34.1's _goalCore debug seam and tintinweb 0.23.2
 * tool calls ONLY. Does not observe CLI/startup workflows, RPC or @mentions.
 * One instance per facade/ExtensionAPI; currentSessionId must read live host
 * state, not a session id captured at installation. Only launches made with an
 * active goal are adopted; their holds cover the WHOLE session/workspace even
 * after focus/create/pause. No timers, wakes or queues.
 */
export function createDelegationGuard(
  pi: ExtensionAPI,
  { currentSessionId }: { currentSessionId: () => string | undefined },
) {
  let core: Core | undefined;
  let session: { id: string; manager: ExtensionContext["sessionManager"] } | undefined;
  const calls = new Map<string, Call>();
  const pending = new Map<string, Call>(); // asynchronous deliveries, not Agent activity

  function clear(): void {
    calls.clear();
    pending.clear();
  }

  function current(ctx: ExtensionContext): boolean {
    if (!session || currentSessionId() !== session.id) return false;
    return ctx.sessionManager === session.manager && ctx.sessionManager.getSessionId() === session.id;
  }

  function hasPending(): boolean {
    return pending.size > 0 || [...calls.values()].some(call => call.operation !== "result");
  }

  function consumedResult(taskId: string, read: Call): void {
    const owner = pending.get(taskId);
    if (owner && read.holds.get(taskId) === owner) pending.delete(taskId);
    // Fresh IDs can finish before their launcher returns. Resumes cannot be
    // credited this way: even a terminal read may have observed the OLD run.
    for (const launch of read.launches) {
      if (launch.resume) continue;
      launch.delivered.add(taskId);
      if (pending.get(taskId) === launch) pending.delete(taskId);
    }
  }

  function notified(taskId: string, toolCallId: string | undefined): void {
    const matches = (call: Call) => toolCallId !== undefined
      ? call.toolCallId === toolCallId : !call.resume;
    const owner = pending.get(taskId);
    if (owner && matches(owner)) pending.delete(taskId);
    // Old outbox notifications survive resume. Only the matching tool-use-id
    // proves an early notification belongs to that resume, in either end order.
    for (const call of calls.values()) {
      if (call.operation !== "result" && matches(call)) call.delivered.add(taskId);
    }
    // Do NOT schedule here. Native delivery/parent settlement owns continuation.
  }

  pi.on("session_start", (_event, ctx) => {
    clear();
    session = { id: ctx.sessionManager.getSessionId(), manager: ctx.sessionManager };
  });
  pi.on("session_shutdown", (_event, ctx) => {
    if (!current(ctx)) return;
    clear();
    session = undefined;
  });
  pi.on("tool_execution_start", (event, ctx) => {
    if (!current(ctx) || !core) return;
    const op = operation(event.toolName, event.args);
    const goal = core.state.goal;
    // A paused goal's result can still be consumed (and its outbox cancelled).
    // Observe reads while holds exist, without adopting new non-goal launches.
    if (!op || (op === "result" ? !(goal?.status === "active" || pending.size || calls.size) : goal?.status !== "active")) return;
    const call: Call = {
      operation: op, toolCallId: event.toolCallId,
      resume: op === "agent" && id(parameters(event.toolName, event.args)?.resume),
      delivered: new Set(), holds: op === "result" ? new Map(pending) : new Map(),
      launches: op === "result" ? [...calls.values()].filter(call => call.operation !== "result" && !call.resume) : [],
    };
    // A read preflighted before a fresh spawn can still consume its unique ID
    // after execution starts (e.g. a handle lookup). Preserve either ordering.
    if (op !== "result" && !call.resume) {
      for (const read of calls.values()) if (read.operation === "result") read.launches.push(call);
    }
    calls.set(event.toolCallId, call);
  });
  pi.on("tool_call", (event, ctx) => {
    if (!current(ctx)) return;
    const call = calls.get(event.toolCallId);
    if (!call || !(call.operation === "result" || call.resume)) return;
    // Pi preflights the whole parallel batch before executing any member. Even
    // start order cannot distinguish an old read from a new run's consumption.
    // Reads accept live handles/aliases, whose canonical IDs are unavailable to
    // this bridge, so reject ALL overlapping read/resume pairs, not just equal
    // input strings. Fresh launches and read/read batches remain unaffected.
    if ([...calls.values()].some(other => other !== call &&
      (call.operation === "result" ? other.resume : other.operation === "result"))) {
      return { block: true, reason: "Cannot overlap subagent result reads with Agent resume (including handle/ID aliases). Consume the result first, then resume in a separate tool batch; read the resumed result after its launch returns." };
    }
  });
  pi.on("tool_execution_end", (event, ctx) => {
    if (!current(ctx)) return;
    const call = calls.get(event.toolCallId);
    if (!call) return;
    calls.delete(event.toolCallId);
    if (event.isError) return;
    if (call.operation === "result") {
      const consumed = consumedId(event.result);
      if (consumed) consumedResult(consumed, call);
      return;
    }
    const details = record(record(event.result)?.details);
    // Workflow is ALWAYS background. AgentDetails has status, not kind.
    const taskId = call.operation === "workflow" ? details?.taskId
      : details?.status === "background" ? details.agentId : undefined;
    if (id(taskId)) {
      // A successful resume supersedes any previous hold for the same ID.
      pending.delete(taskId);
      if (!call.delivered.has(taskId)) pending.set(taskId, call);
    }
  });

  const notification = (event: { message: unknown }, ctx: ExtensionContext): void => {
    if (!current(ctx)) return;
    const message = record(event.message);
    if (message?.role !== "custom" || message.customType !== "subagent-notification") return;
    const details = record(message.details);
    const members = [details, ...(Array.isArray(details?.others) ? details.others.map(record) : [])];
    const toolCalls = notificationCalls(message.content);
    for (const member of members) {
      // GroupJoin holds mutable Agent records: an older group can report a
      // resumed run's new tool-use-id while that run is still queued/running.
      if (id(member?.id) && member.status !== "queued" && member.status !== "running") {
        notified(member.id, toolCalls.get(member.id));
      }
    }
  };
  pi.on("message_start", notification);
  pi.on("message_end", notification);

  return {
    /** False means the private seam is unavailable; caller must reject integration. */
    attach(candidate: unknown): boolean {
      if (core) return candidate === core;
      const raw = record(candidate), state = record(raw?.state), scheduler = record(raw?.scheduler);
      if (!state || !("goal" in state) || typeof scheduler?.schedule !== "function" || typeof scheduler.claim !== "function") return false;
      core = candidate as Core;
      const target = core.scheduler;
      const schedule = target.schedule, claim = target.claim;
      target.schedule = function (ctx) {
        if (current(ctx) && core?.state.goal?.status === "active" && hasPending()) return;
        return schedule.call(this, ctx);
      };
      target.claim = function (ctx) {
        // Claim can be reached by a timer armed BEFORE the tool began. Block
        // before entering it: no allowance, wait-check or generation is spent.
        if (current(ctx) && core?.state.goal?.status === "active" && hasPending()) return null;
        return claim.call(this, ctx);
      };
      return true;
    },

    /** Only update_goal.execute changes. Other tools/functions retain identity. */
    wrapGoalTool<T extends Tool>(tool: T): T {
      if (tool.name !== "update_goal") return tool;
      const execute = tool.execute;
      return {
        ...tool,
        execute(...args: Parameters<T["execute"]>) {
          const [, params, , , ctx] = args;
          // tool_call may preflight an entire parallel batch before ANY execute.
          // Check here so [workflow, complete] cannot bypass the in-flight hold.
          if (record(params)?.status === "complete" && current(ctx) && hasPending()) {
            throw new Error("Cannot complete goal while delegated work is pending. Wait for its completion notification or consume its full result.");
          }
          return execute.apply(this, args);
        },
      } as T;
    },
  };
}
