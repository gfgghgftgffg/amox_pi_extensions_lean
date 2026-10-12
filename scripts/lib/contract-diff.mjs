/**
 * Structural tool-contract diffing for the maintenance flow.
 *
 * The accepted snapshot (`maintenance/tool-contracts.json`) records tools,
 * schemas, descriptions, snippets and guidelines. When a candidate dependency
 * bump is staged, this module compares the accepted snapshot with the fresh
 * capture, ignoring package-version and environment metadata but never
 * ignoring contract content:
 *
 *   - added / removed tools
 *   - added / removed / changed parameters (including `default` values)
 *   - description / promptSnippet changes
 *   - added / removed promptGuidelines
 *
 * Drift in any of these means the lean facade needs a MINIMAL human-made
 * adjustment before the snapshot may be refreshed (the accepted snapshot is
 * preserved on drift).
 */
import { isDeepStrictEqual } from "node:util";

function normalizeTool(tool) {
  return {
    name: tool.name,
    active: Boolean(tool.active),
    source: tool.source ?? "extension",
    description: typeof tool.description === "string" ? tool.description : "",
    promptSnippet: typeof tool.promptSnippet === "string" ? tool.promptSnippet : "",
    promptGuidelines: Array.isArray(tool.promptGuidelines) ? tool.promptGuidelines : [],
    parameters: tool.parameters ?? {},
  };
}

function normalizeRecord(record) {
  return {
    package: record.package,
    registeredTools: record.registeredTools ?? record.tools.map((tool) => tool.name),
    activeToolNames: record.activeToolNames ?? [],
    tools: record.tools.map(normalizeTool),
  };
}

/**
 * Strip environment/version metadata so two snapshots can be compared on the
 * contract surface alone. Throws when the snapshot format version changes.
 */
export function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || snapshot.schemaVersion !== 1) {
    throw new Error("Unsupported tool-contracts snapshot schemaVersion (expected 1)");
  }
  const normalizeGroup = (group) => {
    const result = {};
    for (const name of Object.keys(group ?? {}).sort()) {
      result[name] = normalizeRecord(group[name]);
    }
    return result;
  };
  return {
    schemaVersion: snapshot.schemaVersion,
    upstream: normalizeGroup(snapshot.upstream),
    lean: normalizeGroup(snapshot.lean),
  };
}

/** True when the two snapshots describe the exact same structural contracts. */
export function contractsAreStructurallyEqual(baseline, candidate) {
  return isDeepStrictEqual(normalizeSnapshot(baseline), normalizeSnapshot(candidate));
}

function truncate(text, max = 240) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function preview(text) {
  const firstLine = String(text ?? "")
    .split("\n")
    .find((line) => line.trim().length > 0);
  return truncate(firstLine ?? "", 200);
}

/** Multiset difference: entries in `after` that are not matched in `before`. */
function multisetDifference(before, after) {
  const counts = new Map();
  for (const item of before) counts.set(item, (counts.get(item) ?? 0) + 1);
  const missing = [];
  for (const item of after) {
    const count = counts.get(item) ?? 0;
    if (count > 0) counts.set(item, count - 1);
    else missing.push(item);
  }
  return missing;
}

/** Recursive JSON diff producing flat `path: from -> to` entries. */
export function diffJson(before, after, path = "") {
  const entries = [];
  const beforeIsObject = before !== null && typeof before === "object" && !Array.isArray(before);
  const afterIsObject = after !== null && typeof after === "object" && !Array.isArray(after);
  if (beforeIsObject && afterIsObject) {
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      const childPath = path ? `${path}.${key}` : key;
      const inBefore = Object.prototype.hasOwnProperty.call(before, key);
      const inAfter = Object.prototype.hasOwnProperty.call(after, key);
      if (inBefore && !inAfter) entries.push({ path: childPath, kind: "removed", from: before[key], to: undefined });
      else if (!inBefore && inAfter) entries.push({ path: childPath, kind: "added", from: undefined, to: after[key] });
      else entries.push(...diffJson(before[key], after[key], childPath));
    }
    return entries;
  }
  if (!isDeepStrictEqual(before, after)) {
    entries.push({ path: path || "(root)", kind: "changed", from: before, to: after });
  }
  return entries;
}

function diffGuidelines(before, after) {
  return {
    added: multisetDifference(before, after),
    removed: multisetDifference(after, before),
  };
}

function diffTool(before, after) {
  const descriptionChanged = before.description !== after.description;
  const snippetChanged = before.promptSnippet !== after.promptSnippet;
  const guidelines = diffGuidelines(before.promptGuidelines, after.promptGuidelines);
  const parameterEntries = diffJson(before.parameters, after.parameters, "");
  const changed = descriptionChanged
    || snippetChanged
    || guidelines.added.length > 0
    || guidelines.removed.length > 0
    || parameterEntries.length > 0
    || before.active !== after.active;
  return {
    name: after.name,
    status: changed ? "changed" : "unchanged",
    activeBefore: before.active,
    activeAfter: after.active,
    descriptionChanged,
    descriptionBefore: descriptionChanged ? preview(before.description) : undefined,
    descriptionAfter: descriptionChanged ? preview(after.description) : undefined,
    snippetChanged,
    snippetBefore: snippetChanged ? preview(before.promptSnippet) : undefined,
    snippetAfter: snippetChanged ? preview(after.promptSnippet) : undefined,
    guidelinesAdded: guidelines.added,
    guidelinesRemoved: guidelines.removed,
    parameters: {
      added: parameterEntries.filter((entry) => entry.kind === "added"),
      removed: parameterEntries.filter((entry) => entry.kind === "removed"),
      changed: parameterEntries.filter((entry) => entry.kind === "changed"),
    },
  };
}

function diffGroup(direction, baselineGroup, candidateGroup) {
  const results = [];
  const packageNames = [...new Set([...Object.keys(baselineGroup), ...Object.keys(candidateGroup)])].sort();
  for (const packageName of packageNames) {
    const before = baselineGroup[packageName];
    const after = candidateGroup[packageName];
    if (!before) {
      results.push({ direction, package: packageName, status: "added", addedTools: after.registeredTools, removedTools: [], tools: [] });
      continue;
    }
    if (!after) {
      results.push({ direction, package: packageName, status: "removed", addedTools: [], removedTools: before.registeredTools, tools: [] });
      continue;
    }
    const beforeTools = new Map(before.tools.map((tool) => [tool.name, tool]));
    const afterTools = new Map(after.tools.map((tool) => [tool.name, tool]));
    const addedTools = [...afterTools.keys()].filter((name) => !beforeTools.has(name)).sort();
    const removedTools = [...beforeTools.keys()].filter((name) => !afterTools.has(name)).sort();
    const tools = [];
    for (const name of afterTools.keys()) {
      if (beforeTools.has(name)) tools.push(diffTool(beforeTools.get(name), afterTools.get(name)));
    }
    const entry = {
      direction,
      package: packageName,
      status: "present",
      addedTools,
      removedTools,
      activeToolNamesChanged: !isDeepStrictEqual(before.activeToolNames, after.activeToolNames),
      tools,
    };
    const changed = addedTools.length > 0
      || removedTools.length > 0
      || entry.activeToolNamesChanged
      || tools.some((tool) => tool.status !== "unchanged");
    if (changed) results.push(entry);
  }
  return results;
}

/**
 * Compare baseline and candidate snapshots and return a structured diff.
 * `drift` is true when any package/tool/parameter/description/guideline
 * changed; package versions and environment metadata are intentionally
 * ignored.
 */
export function diffContractSnapshots(baseline, candidate) {
  const before = normalizeSnapshot(baseline);
  const after = normalizeSnapshot(candidate);
  const packages = [
    ...diffGroup("upstream", before.upstream, after.upstream),
    ...diffGroup("lean", before.lean, after.lean),
  ];
  packages.sort((left, right) => left.package.localeCompare(right.package) || left.direction.localeCompare(right.direction));
  return { drift: packages.length > 0, packages };
}

function renderParameterEntries(label, entries, limit = 10) {
  if (entries.length === 0) return [];
  const lines = [`  - ${label}: ${entries.length}`];
  for (const entry of entries.slice(0, limit)) {
    const from = entry.from === undefined ? "(absent)" : JSON.stringify(entry.from);
    const to = entry.to === undefined ? "(absent)" : JSON.stringify(entry.to);
    const detail = entry.kind === "changed" ? `${truncate(from, 80)} -> ${truncate(to, 80)}` : `${truncate(to ?? from, 80)}`;
    lines.push(`    - \`${entry.path}\` ${detail}`);
  }
  if (entries.length > limit) lines.push(`    - … 其余 ${entries.length - limit} 项见 diagnostics/contract-diff.json`);
  return lines;
}

/** Render a concise Chinese markdown summary of a contract diff. */
export function renderContractDiffMarkdown(diff) {
  if (!diff.drift) return "结构契约与已接受快照一致（无工具/参数/描述/guideline 漂移）。\n";
  const lines = ["检测到结构契约漂移（已接受快照保持不变，等待人工调整）：", ""];
  for (const entry of diff.packages) {
    lines.push(`### ${entry.direction} \`${entry.package}\` (${entry.status})`);
    if (entry.addedTools.length > 0) lines.push(`- 新增工具: ${entry.addedTools.map((name) => `\`${name}\``).join(", ")}`);
    if (entry.removedTools.length > 0) lines.push(`- 删除工具: ${entry.removedTools.map((name) => `\`${name}\``).join(", ")}`);
    if (entry.activeToolNamesChanged) lines.push("- 活跃工具列表发生变化");
    for (const tool of entry.tools) {
      if (tool.status === "unchanged") continue;
      lines.push(`- \`${tool.name}\`${tool.activeBefore !== tool.activeAfter ? ` active ${tool.activeBefore} -> ${tool.activeAfter}` : ""}`);
      if (tool.descriptionChanged) lines.push(`  - 描述变化: ${tool.descriptionBefore} -> ${tool.descriptionAfter}`);
      if (tool.snippetChanged) lines.push(`  - promptSnippet 变化: ${tool.snippetBefore} -> ${tool.snippetAfter}`);
      if (tool.guidelinesAdded.length > 0) lines.push(`  - guideline 新增 ${tool.guidelinesAdded.length} 条`);
      if (tool.guidelinesRemoved.length > 0) lines.push(`  - guideline 删除 ${tool.guidelinesRemoved.length} 条`);
      lines.push(...renderParameterEntries("参数新增", tool.parameters.added));
      lines.push(...renderParameterEntries("参数删除", tool.parameters.removed));
      lines.push(...renderParameterEntries("参数/default 变化", tool.parameters.changed));
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
