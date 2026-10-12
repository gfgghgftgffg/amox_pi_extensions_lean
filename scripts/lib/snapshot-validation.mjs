/** Strict snapshot data renewal. Artifact data never authorizes prompt edits. */
import { isDeepStrictEqual } from "node:util";
import { contractsAreStructurallyEqual } from "./contract-diff.mjs";

function keys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())) throw new Error(`${label}: 额外/缺失 JSON 字段`);
}

function validateCounters(snapshot) {
  keys(snapshot, ["schemaVersion", "estimator", "environment", "upstream", "lean"], "snapshot");
  keys(snapshot.environment, ["piVersion", "nodeVersion"], "environment");
  if (Object.values(snapshot.environment).some((v) => typeof v !== "string" || v.length === 0 || v.length > 100)) throw new Error("environment: 版本 metadata 必须是有限字符串");
  for (const group of ["upstream", "lean"]) {
    if (!snapshot[group] || typeof snapshot[group] !== "object" || Array.isArray(snapshot[group])) throw new Error(`${group}: 必须是对象`);
    for (const [name, record] of Object.entries(snapshot[group])) {
      keys(record, ["package", "version", "entry", "registeredTools", "activeToolNames", "totals", "tools", ...(group === "lean" ? ["upstreamPackage"] : [])], name);
      if (!Array.isArray(record.tools)) throw new Error(`${name}: tools 必须是数组`);
      let registeredProxyTokens = 0;
      let activeProxyTokens = 0;
      for (const tool of record.tools) {
        keys(tool, ["name", "active", "source", "description", "promptSnippet", "promptGuidelines", "parameters", "chars", "proxyTokens"], `${name}.tool`);
        if ([tool.name, tool.source, tool.description, tool.promptSnippet].some((v) => typeof v !== "string") || typeof tool.active !== "boolean" || !Array.isArray(tool.promptGuidelines) || tool.promptGuidelines.some((v) => typeof v !== "string") || !tool.parameters || typeof tool.parameters !== "object" || Array.isArray(tool.parameters)) throw new Error(`${name}: 非法 tool contract shape`);
        const chars = { description: tool.description.length, schema: JSON.stringify(tool.parameters).length, snippet: tool.promptSnippet.length, guidelines: tool.promptGuidelines.reduce((sum, g) => sum + g.length, 0) };
        chars.total = Object.values(chars).reduce((sum, n) => sum + n, 0);
        if (!isDeepStrictEqual(tool.chars, chars) || tool.proxyTokens !== Math.ceil(chars.total / 4)) throw new Error(`${name}.${tool.name}: chars/proxyTokens 必须由实际 contract strings 推导`);
        registeredProxyTokens += tool.proxyTokens;
        if (tool.active) activeProxyTokens += tool.proxyTokens;
      }
      if (!isDeepStrictEqual(record.totals, { registeredProxyTokens, activeProxyTokens })) throw new Error(`${name}: totals 必须由 tools 推导`);
    }
  }
}

export function compareSnapshot({ baselineSnapshot, candidateSnapshot, manifestEntries, targetVersions, errors }) {
  try {
    // One contract definition, also used by producer drift diagnostics.
    if (!contractsAreStructurallyEqual(baselineSnapshot, candidateSnapshot)) errors.push("maintenance/tool-contracts.json: 存在结构契约漂移时不允许更新/刷新已接受快照");
    validateCounters(candidateSnapshot);
    const expected = structuredClone(baselineSnapshot);
    expected.environment = candidateSnapshot.environment;
    for (const [id, version] of targetVersions) expected.upstream[manifestEntries.get(id).upstreamPackage].version = version;
    if (!isDeepStrictEqual(expected, candidateSnapshot)) throw new Error("只允许 environment 和声明升级的 upstream version 变化；package/entry/lean versions/无关 metadata/额外字段必须保留");
  } catch (error) {
    errors.push(`maintenance/tool-contracts.json: ${error.message}`);
  }
}
