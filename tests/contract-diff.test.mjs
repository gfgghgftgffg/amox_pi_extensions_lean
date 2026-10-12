// Structural contract-diff tests: drift must be detected for tools, params,
// defaults, descriptions and guidelines, while package versions and node/pi
// environment metadata are ignored (they change on every dependency bump).
import assert from "node:assert/strict";
import test from "node:test";
import {
  contractsAreStructurallyEqual,
  diffContractSnapshots,
  renderContractDiffMarkdown,
} from "../scripts/lib/contract-diff.mjs";

function tool(name, overrides = {}) {
  return {
    name,
    active: true,
    source: "extension",
    description: `${name} description`,
    promptSnippet: `${name} snippet`,
    promptGuidelines: ["guideline one"],
    parameters: { type: "object", properties: { input: { type: "string" } }, required: ["input"] },
    chars: { description: 1, schema: 1, snippet: 1, guidelines: 1, total: 4 },
    proxyTokens: 1,
    ...overrides,
  };
}

function snapshot({ version = "1.0.0", pi = "1.1.0", node = "v22.22.1", upstreamTools = [tool("Alpha")], leanTools = [tool("lean")] } = {}) {
  return {
    schemaVersion: 1,
    estimator: "fixed character proxy",
    environment: { piVersion: pi, nodeVersion: node },
    upstream: {
      "engine": {
        package: "engine",
        version,
        entry: "node_modules/engine/index.ts",
        registeredTools: upstreamTools.map((entry) => entry.name),
        activeToolNames: upstreamTools.filter((entry) => entry.active).map((entry) => entry.name),
        totals: { registeredProxyTokens: upstreamTools.length, activeProxyTokens: upstreamTools.length },
        tools: upstreamTools,
      },
    },
    lean: {
      "engine-lean": {
        package: "engine-lean",
        version: "0.1.0",
        entry: "packages/engine-lean/index.ts",
        upstreamPackage: "engine",
        registeredTools: leanTools.map((entry) => entry.name),
        activeToolNames: leanTools.filter((entry) => entry.active).map((entry) => entry.name),
        totals: { registeredProxyTokens: leanTools.length, activeProxyTokens: leanTools.length },
        tools: leanTools,
      },
    },
  };
}

const baseline = snapshot();

test("identical contracts have no drift", () => {
  const diff = diffContractSnapshots(baseline, snapshot());
  assert.equal(diff.drift, false);
  assert.deepEqual(diff.packages, []);
  assert.ok(contractsAreStructurallyEqual(baseline, snapshot()));
});

test("package version and environment metadata changes are ignored", () => {
  const diff = diffContractSnapshots(baseline, snapshot({ version: "2.0.0", pi: "1.2.0", node: "v23.0.0" }));
  assert.equal(diff.drift, false);
  assert.ok(contractsAreStructurallyEqual(baseline, snapshot({ version: "2.0.0" })));
  assert.throws(() => contractsAreStructurallyEqual(baseline, { ...snapshot(), schemaVersion: 2 }), /schemaVersion/);
});

test("added and removed tools are flagged", () => {
  const added = diffContractSnapshots(baseline, snapshot({ upstreamTools: [tool("Alpha"), tool("Beta")] }));
  assert.equal(added.drift, true);
  const addedEntry = added.packages.find((entry) => entry.package === "engine");
  assert.deepEqual(addedEntry.addedTools, ["Beta"]);
  assert.match(renderContractDiffMarkdown(added), /新增工具: `Beta`/);

  const removed = diffContractSnapshots(baseline, snapshot({ upstreamTools: [] }));
  assert.equal(removed.drift, true);
  assert.deepEqual(removed.packages.find((entry) => entry.package === "engine").removedTools, ["Alpha"]);
  assert.match(renderContractDiffMarkdown(removed), /删除工具: `Alpha`/);
});

test("new params, changed defaults and removed params are flagged with paths", () => {
  const before = snapshot({
    upstreamTools: [
      tool("Alpha", {
        parameters: {
          type: "object",
          properties: {
            input: { type: "string" },
            limit: { type: "number", default: 20 },
            gone: { type: "boolean" },
          },
          required: ["input", "limit"],
        },
      }),
    ],
  });
  const after = snapshot({
    upstreamTools: [
      tool("Alpha", {
        parameters: {
          type: "object",
          properties: {
            input: { type: "string" },
            limit: { type: "number", default: 10 },
            extra: { type: "string" },
          },
          required: ["input", "limit", "extra"],
        },
      }),
    ],
  });
  const diff = diffContractSnapshots(before, after);
  assert.equal(diff.drift, true);
  const alpha = diff.packages.find((entry) => entry.package === "engine").tools.find((entry) => entry.name === "Alpha");
  assert.ok(alpha.parameters.added.some((entry) => entry.path === "properties.extra"));
  assert.ok(alpha.parameters.removed.some((entry) => entry.path === "properties.gone"));
  assert.ok(alpha.parameters.changed.some((entry) => entry.path === "properties.limit.default" && entry.from === 20 && entry.to === 10));
  assert.ok(alpha.parameters.changed.some((entry) => entry.path === "required"));
  const rendered = renderContractDiffMarkdown(diff);
  assert.match(rendered, /参数新增/);
  assert.match(rendered, /参数删除/);
  assert.match(rendered, /参数\/default 变化/);
});

test("description, snippet, guideline and active changes are flagged", () => {
  const changed = snapshot({
    upstreamTools: [
      tool("Alpha", {
        active: false,
        description: "new description text",
        promptSnippet: "new snippet",
        promptGuidelines: ["guideline two", "guideline three"],
      }),
    ],
  });
  const diff = diffContractSnapshots(baseline, changed);
  assert.equal(diff.drift, true);
  const alpha = diff.packages.find((entry) => entry.package === "engine").tools.find((entry) => entry.name === "Alpha");
  assert.equal(alpha.descriptionChanged, true);
  assert.equal(alpha.snippetChanged, true);
  assert.equal(alpha.activeBefore, true);
  assert.equal(alpha.activeAfter, false);
  assert.deepEqual(alpha.guidelinesAdded, ["guideline two", "guideline three"]);
  assert.deepEqual(alpha.guidelinesRemoved, ["guideline one"]);
  const rendered = renderContractDiffMarkdown(diff);
  assert.match(rendered, /描述变化/);
  assert.match(rendered, /promptSnippet 变化/);
  assert.match(rendered, /guideline 新增/);
});

test("package additions/removals are drift", () => {
  const withoutLean = snapshot();
  delete withoutLean.lean["engine-lean"];
  const removed = diffContractSnapshots(baseline, withoutLean);
  assert.equal(removed.drift, true);
  assert.equal(removed.packages.find((entry) => entry.package === "engine-lean").status, "removed");

  const extra = snapshot();
  extra.lean["engine-lean-copy"] = { ...extra.lean["engine-lean"], package: "engine-lean-copy" };
  const added = diffContractSnapshots(baseline, extra);
  assert.equal(added.drift, true);
  assert.equal(added.packages.find((entry) => entry.package === "engine-lean-copy").status, "added");
});

test("no-drift render states contracts are unchanged", () => {
  assert.match(renderContractDiffMarkdown(diffContractSnapshots(baseline, snapshot())), /一致/);
});
