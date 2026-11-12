import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  alias: { "pi-goal-x/extensions/goal.ts": fileURLToPath(new URL("./fixtures/upstream.mjs", import.meta.url)) },
});
const { createGoalFacade } = await jiti.import(fileURLToPath(new URL("../index.ts", import.meta.url)));
const names = ["create_goal", "get_goal", "update_goal", "set_goal_tasks", "update_goal_task",
  "goal_question", "goal_questionnaire", "propose_goal_draft"];
const makeCore = () => ({ state: { goal: null }, scheduler: { schedule() {}, claim() { return null; } } });
const withCore = upstream => pi => { pi._goalCore = makeCore(); upstream(pi); };

// Explicit expected constraints and data: annotations are added at schema positions below.
const constraints = {
  $id: "goal-fixture", $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object", required: ["description", "items"], additionalProperties: false,
  properties: {
    description: { type: "string", minLength: 1, maxLength: 200, pattern: "^[a-z]+$" },
    items: { type: "array", minItems: 1, maxItems: 50, uniqueItems: true,
      items: { type: "object", required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 10, multipleOf: 1 } }, additionalProperties: false },
      contains: { const: { description: "contains data" } }, minContains: 1, maxContains: 2 },
    payload: { default: { description: "default data", properties: { description: "nested data" } },
      const: { description: "const data" }, enum: [{ description: "enum data" }], examples: [{ description: "example data" }] },
    union: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }],
      oneOf: [{ const: 1 }, { const: 2 }], allOf: [{ minimum: 0 }] },
    tuple: { type: "array", prefixItems: [{ type: "string" }], items: false },
    legacyTuple: { items: [{ type: "number", exclusiveMinimum: 0, exclusiveMaximum: 100 }] },
  },
  patternProperties: { "^x-": { type: "boolean" } },
  $defs: { node: { type: "string" } }, definitions: { legacy: { $ref: "#/$defs/node" } },
  dependentSchemas: { items: { required: ["description"] } }, dependentRequired: { items: ["description"] },
  unevaluatedProperties: { type: "string" }, propertyNames: { pattern: "^[a-z]+$" },
  not: { required: ["forbidden"] }, if: { required: ["items"] },
  then: { minProperties: 1 }, else: { maxProperties: 3 },
};
const annotationPaths = [[], ["properties", "description"], ["properties", "items"],
  ["properties", "items", "items"], ["properties", "items", "items", "properties", "id"],
  ["properties", "items", "contains"], ["properties", "payload"], ["properties", "union"],
  ...["anyOf", "oneOf"].flatMap(key => [0, 1].map(i => ["properties", "union", key, i])),
  ["properties", "union", "allOf", 0], ["properties", "tuple", "prefixItems", 0],
  ["properties", "legacyTuple", "items", 0], ["patternProperties", "^x-"], ["$defs", "node"],
  ["definitions", "legacy"], ["dependentSchemas", "items"],
  ...["unevaluatedProperties", "propertyNames", "not", "if", "then", "else"].map(key => [key])];
function annotatedSchema() {
  const schema = structuredClone(constraints);
  for (const path of annotationPaths) {
    path.reduce((node, key) => node[key], schema).description = "Verbose schema annotation";
  }
  return schema;
}

// Except for update_goal's pending-delegation guard, non-metadata tool fields
// and forwarded upstream ExtensionAPI calls remain opaque passthroughs.
test("facade compresses known metadata while preserving upstream contracts and forwarding", async () => {
  const registered = [], originals = [], calls = [];
  const result = { content: [{ type: "text", text: "original result" }], details: { marker: true } };
  const pi = {
    registerTool(tool) { assert.equal(this, pi); registered.push(tool); return tool.name; },
    events: { marker: "event bus" },
  };
  const hook = () => {};
  const command = { handler() {} };
  const shortcut = { handler() {} };
  const renderer = () => {};
  for (const method of ["on", "registerCommand", "registerShortcut", "registerMessageRenderer", "setActiveTools", "getActiveTools"]) {
    pi[method] = function (...args) {
      assert.equal(this, pi, `${method} retains its host receiver`);
      calls.push([method, ...args]);
      return method === "getActiveTools" ? ["read", "todo"] : "forwarded";
    };
  }
  const extra = Symbol("extra registration field");
  const core = makeCore();
  const upstream = capture => {
    assert.equal(capture.events, pi.events);
    capture._goalCore = core;
    for (const name of names) {
      const tool = {
        name, label: `${name} label`, description: "Verbose upstream description",
        promptSnippet: "Verbose upstream prompt snippet", parameters: annotatedSchema(),
        promptGuidelines: ["Original policy must survive."], executionMode: "sequential",
        renderCall: renderer, renderResult: renderer, [extra]: { opaque: true },
        execute(...args) { calls.push([name, ...args]); return result; },
      };
      originals.push(tool);
      assert.equal(capture.registerTool(tool), name);
    }
    assert.equal(capture.on("session_start", hook), "forwarded");
    assert.equal(capture.registerCommand("goal", command), "forwarded");
    assert.equal(capture.registerShortcut("ctrl+shift+a", shortcut), "forwarded");
    assert.equal(capture.registerMessageRenderer("pi-goal-event", renderer), "forwarded");
    assert.deepEqual(capture.getActiveTools(), ["read", "todo"]);
    assert.equal(capture.setActiveTools(["read", "todo", "create_goal"]), "forwarded");
  };
  createGoalFacade(upstream)(pi);
  assert.deepEqual(registered.map(tool => tool.name), names);
  assert.equal(pi._goalCore, core, "the upstream core seam passes through the proxy");
  const upstreamCalls = calls.filter(([method, , callback]) => method !== "on" || callback === hook);
  assert.deepEqual(upstreamCalls, [["on", "session_start", hook], ["registerCommand", "goal", command],
    ["registerShortcut", "ctrl+shift+a", shortcut], ["registerMessageRenderer", "pi-goal-event", renderer],
    ["getActiveTools"], ["setActiveTools", ["read", "todo", "create_goal"]]]);
  for (let i = 0; i < names.length; i++) {
    const original = originals[i], lean = registered[i];
    assert.equal(typeof lean.description, "string");
    assert.ok(lean.description.length > 0);
    assert.notEqual(lean.description, original.description);
    assert.equal(lean.promptSnippet, "");
    assert.deepEqual(lean.parameters, constraints, `${lean.name}: every constraint and description-valued data survives`);
    assert.deepEqual(original.parameters, annotatedSchema(), "upstream schemas are never mutated");
    assert.notEqual(lean.parameters.properties.items, original.parameters.properties.items);
    assert.deepEqual(Reflect.ownKeys(lean), Reflect.ownKeys(original));
    for (const key of Reflect.ownKeys(original).filter(key => !["description", "parameters", "promptSnippet"].includes(key)
      && !(lean.name === "update_goal" && key === "execute"))) {
      assert.equal(lean[key], original[key], `${lean.name}/${String(key)} preserves identity`);
    }
    // update_goal may wrap execute solely for the parent's pending-delegation gate;
    // its no-pending path must still forward the exact arguments and result.
    assert.equal(typeof lean.execute, "function");
    const args = ["call-id", { task_id: "one" }, new AbortController().signal, () => {}, { cwd: "isolated" }];
    assert.equal(await lean.execute(...args), result);
    const call = calls.at(-1);
    assert.equal(call[0], lean.name);
    args.forEach((arg, index) => assert.equal(call[index + 1], arg));
  }
});

test("schema-valued additionalProperties is stripped without losing its constraints", () => {
  const tools = [];
  createGoalFacade(withCore(pi => pi.registerTool({ name: "get_goal", description: "upstream", parameters: {
    type: "object", additionalProperties: { type: "string", minLength: 2, description: "annotation" },
  } })))({ on() {}, registerTool(tool) { tools.push(tool); } });
  assert.deepEqual(tools[0].parameters, { type: "object", additionalProperties: { type: "string", minLength: 2 } });
});

test("a missing upstream scheduler seam fails explicitly instead of losing the delegation gate", () => {
  assert.throws(() => createGoalFacade(() => {})({ on() {} }), /upstream goal scheduler integration is unavailable/);
});

test("unknown upstream tools pass through by reference, including metadata and registration result", () => {
  const unknown = { name: "future_goal_tool", description: "Keep this", parameters: annotatedSchema(),
    promptSnippet: "Keep this too", execute() {} };
  const token = {};
  createGoalFacade(withCore(pi => assert.equal(pi.registerTool(unknown), token)))({
    on() {}, registerTool(tool) { assert.equal(tool, unknown); return token; },
  });
  assert.deepEqual(unknown.parameters, annotatedSchema());
  assert.equal(unknown.promptSnippet, "Keep this too");
});
