// Keep goal-x's tool identities and lifecycle intact; only provider metadata is lean.
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import goal from "pi-goal-x/extensions/goal.ts";
import { registerGoalContext } from "pi-goal-x/extensions/goal-context.ts";
import { filterGoalSessionContext, isDelegatedGoalSession } from "pi-goal-x/extensions/goal-session-safety.ts";
import { isSubagentChild } from "./integration.ts";
import { createDelegationGuard } from "./delegation.ts";

const DESCRIPTIONS: Record<string, string> = {
  create_goal: "Create and focus a persistent goal only at the user's request. mode=sisyphus follows ordered steps; token_budget caps lifetime spending, not context.",
  get_goal: "Read goal summary; section=objective|tasks|history pages full details with cursor. task_id selects a task; verbose returns full legacy output.",
  update_goal: "Complete (audited), block, or pause a goal; reason required for blocked/paused. Alternatively declare continuation; wait requires strictExecutionContract and a future ISO deadline. Reuse wait_id/deadline on recheck.",
  set_goal_tasks: "Confirm a flat parent-linked task tree; matching IDs retain progress, removed IDs are deleted. block_completion defaults false. Confirmation stops the turn, then continues.",
  update_goal_task: "Update task_id/status or ordered atomic updates; one invalid entry rejects the batch. Evidence completes contracted tasks; reason is required to skip.",
  goal_question: "Ask one user-started drafting question. recommended is zero-based; allow_custom defaults true.",
  goal_questionnaire: "Ask a batch of user-started drafting questions. recommended is zero-based; allow_custom defaults true.",
  propose_goal_draft: "Confirm a draft before execution. Preserve objective for budget-only tweaks; token_budget=null removes the cap, omit retains it. auto_continue defaults true; sisyphus must match the user's mode.",
};

// Visit schema positions only: a field named 'description' or an object-valued
// default/const/enum is data, not a schema annotation to discard.
function stripDescriptions(schema: unknown): void {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const node = schema as Record<string, unknown>;
  delete node.description;
  for (const key of ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]) {
    const map = node[key];
    if (map && typeof map === "object") for (const child of Object.values(map)) stripDescriptions(child);
  }
  for (const key of ["items", "additionalProperties", "unevaluatedProperties", "contains", "propertyNames", "not", "if", "then", "else"]) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach(stripDescriptions);
    else stripDescriptions(child);
  }
  for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
    const children = node[key];
    if (Array.isArray(children)) children.forEach(stripDescriptions);
  }
}

type RegisteredTool = ToolDefinition<any, any, any>;
type Upstream = (pi: ExtensionAPI) => void;

export function createGoalFacade(upstream: Upstream = goal): Upstream {
  return (pi) => {
    if (isDelegatedGoalSession() || isSubagentChild()) {
      registerGoalContext(pi, (messages) => filterGoalSessionContext(messages, true));
      return;
    }
    let sessionId: string | undefined;
    const delegation = createDelegationGuard(pi, { currentSessionId: () => sessionId });
    pi.on("session_start", (_event, ctx) => { sessionId = ctx.sessionManager.getSessionId(); });
    pi.on("session_shutdown", () => { sessionId = undefined; });
    upstream(new Proxy(pi, {
      get(target, property) {
        if (property === "registerTool") return (tool: RegisteredTool) => {
          // New upstream tools stay functional and unmodified until reviewed.
          if (!Object.hasOwn(DESCRIPTIONS, tool.name)) return target.registerTool(tool);
          const parameters = JSON.parse(JSON.stringify(tool.parameters));
          stripDescriptions(parameters);
          return target.registerTool(delegation.wrapGoalTool({
            ...tool,
            description: DESCRIPTIONS[tool.name],
            parameters,
            promptSnippet: "",
            // Upstream policy, validation, execution mode and renderers survive.
          }));
        };
        const member = Reflect.get(target, property, target);
        return typeof member === "function" ? member.bind(target) : member;
      },
    }));
    if (!delegation.attach((pi as unknown as { _goalCore?: unknown })._goalCore)) {
      throw new Error("pi-goal-x-lean: upstream goal scheduler integration is unavailable; review the pinned runtime before enabling goal continuation.");
    }
  };
}

export default createGoalFacade();
