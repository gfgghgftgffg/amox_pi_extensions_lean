import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type Tool = ToolDefinition<any, any, any>;
const examples: Record<string, Record<string, unknown>> = {
  create_goal: { objective: "Export the report as CSV" },
  get_goal: { section: "tasks" },
  update_goal: { status: "paused", reason: "Waiting for the user's decision" },
  set_goal_tasks: { tasks: [{ id: "csv", title: "Export CSV" }] },
  update_goal_task: { task_id: "csv", status: "complete", evidence: "CSV export test passed" },
  goal_questionnaire: { questions: [{ question: "Which format?", options: ["CSV", "JSON"] }] },
  propose_goal_draft: { objective: "Export the report as CSV and verify the exported rows" },
};

function description(names: string[]) {
  return `Goal operations: ${names.join(", ")}. Create only on user request. input: JSON object string; help takes an operation name.`;
}

function callExample(name: string) {
  return name === "get_goal" ? `get_goal(${JSON.stringify(examples[name])})`
    : `goal(${JSON.stringify({ op: name, input: JSON.stringify(examples[name]) })})`;
}

export function registerRouter(pi: ExtensionAPI, originals: Map<string, Tool>) {
  const routed = (name: string) => originals.has(name);
  // get_goal stays directly declared, but may also be reached through goal.
  const hidden = (name: string) => name !== "get_goal" && originals.has(name);
  pi.registerTool({
    name: "goal", label: "Goal", exposure: "model-only", executionMode: "sequential",
    description: description([...originals.keys()].filter(hidden)), promptSnippet: "",
    parameters: Type.Object({ op: Type.String(), input: Type.Optional(Type.String()) }, { additionalProperties: false }),
    reachesTools: ({ op }) => typeof op === "string" && routed(op) ? [op] : [],
    prepareLoadout({ declared }) {
      const hiddenDeclarations = declared.map(t => t.name).filter(hidden);
      return { hiddenDeclarations, descriptions: { goal: description(hiddenDeclarations) } };
    },
    async execute(_id, { op, input }, signal, onUpdate, ctx) {
      const available = ctx.tools.map(tool => tool.name).filter(name => originals.has(name));
      if (op === "help") {
        const name = input?.trim();
        let text = `Goal help topics: ${available.join(", ")}. Pass the topic as input; get_goal is also callable directly.`;
        if (name) {
          const tool = originals.get(name);
          if (!tool || !available.includes(name)) throw new Error(`Unknown or inactive goal help topic: ${name}`);
          const guidelines = Array.isArray(tool.promptGuidelines) ? tool.promptGuidelines : [];
          text = [tool.description, tool.promptSnippet, ...guidelines,
            JSON.stringify(tool.parameters), `Example: ${callExample(name)}`].filter(Boolean).join("\n");
        }
        return { content: [{ type: "text", text }], details: undefined };
      }
      if (!routed(op) || !available.includes(op)) throw new Error(`Unknown or unavailable goal operation: ${op}. Use goal help or call get_goal directly.`);
      let args: unknown;
      try { args = JSON.parse(input ?? "{}"); }
      catch { throw new Error(`Invalid JSON in input for ${op}. Use goal help for an example.`); }
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error(`input for ${op} must encode a JSON object.`);
      const outcome = await ctx.executeTool(op, args, { signal, onUpdate });
      // Pi already aggregates nested usage onto this call. Preserve every other
      // result field, including details, termination and error text; errors must
      // reach the model as errors rather than successful wrapping text.
      const { usage: _nestedUsage, ...result } = outcome.result;
      return { ...result, isError: outcome.isError || result.isError === true };
    },
  });
}

/** Upstream control text and older transcripts use the native tool names. Interpret
 * them in the current phase without rewriting stored user objectives or evidence. */
export function registerStageGuidance(pi: ExtensionAPI, core: { state: { goal: { status: string } | null } }) {
  pi.on("before_agent_start", (event, ctx) => {
    const active = pi.getActiveTools();
    if (!active.includes("goal")) return;
    const tasks = active.includes("set_goal_tasks");
    const draft = ctx.sessionManager.getBranch().slice().reverse().find(entry => entry.type === "custom" && entry.customType === "pi-goal-draft");
    const drafting = draft?.type === "custom" && !(draft.data as { clearedAt?: string } | undefined)?.clearedAt;
    let guidance: string;
    if (drafting) {
      guidance = `Draft: use goal with op goal_questionnaire to clarify or propose_goal_draft to open confirmation. ${callExample("propose_goal_draft")}`;
      if (!tasks) guidance += " Task tracking is disabled; omit tasks.";
    } else if (["active", "paused"].includes(core.state.goal?.status ?? "")) {
      guidance = `Call get_goal directly. For lifecycle and continuation use goal with op update_goal. ${callExample("update_goal")}`;
      if (core.state.goal?.status === "active") {
        if (tasks) guidance += ` For task planning use goal with op set_goal_tasks; confirmation stops the turn, then continues.`;
        if (active.includes("update_goal_task")) guidance += ` For task progress use ${callExample("update_goal_task")}.`;
      }
    } else return;
    event.systemPromptOptions.sections.goal_operations = `In goal instructions, named operations take their arguments as the JSON string in goal.input. ${guidance}`;
  });
}
