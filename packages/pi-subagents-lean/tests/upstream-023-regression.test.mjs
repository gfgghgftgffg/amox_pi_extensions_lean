import assert from "node:assert/strict";
import test, { after } from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "lean-subagents-023-"));
const previousCwd = process.cwd();
const cwd = join(root, "cwd");
mkdirSync(cwd);
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.chdir(cwd);
after(() => { process.chdir(previousCwd); rmSync(root, { recursive: true, force: true }); });
const jiti = createJiti(import.meta.url, { moduleCache: true });
const { default: extension } = await jiti.import(fileURLToPath(new URL("../index.ts", import.meta.url)));
const tools = [], noop = () => undefined;
extension(new Proxy({ registerTool: tool => tools.push(tool), events: { on: noop, emit: noop }, getFlag: noop }, { get: (target, key) => key in target ? target[key] : noop }));
assert.deepEqual(tools.map(tool => tool.name), ["subagent"]);
const facade = tools[0];
const text = result => result.content.filter(c => c.type === "text").map(c => c.text).join("\n");
const record = (id, result, extra = {}) => ({ type: "custom", customType: "subagents:record", data: { id, type: "Explore", description: "Saved offline task", status: "completed", result, startedAt: 1000, completedAt: 2000, handle: "explore", alias: "audit", ...extra } });

test("real dist retrieves latest saved results by id, handle and alias through facade", async () => {
  const branch = [record("old-id", "Old output"), record("new-id", "Latest output")];
  const ctx = { cwd, sessionManager: { getBranch: () => branch } };
  for (const agent_id of ["new-id", "Explore", "AUDIT"]) {
    const result = await facade.execute("saved-result", { op: "result", agent_id, input: JSON.stringify({ verbose: true }) }, undefined, undefined, ctx);
    assert.match(text(result), /Agent: new-id/);
    assert.match(text(result), /Latest output/);
    assert.match(text(result), /saved record/);
    assert.doesNotMatch(text(result), /Old output/);
    // Saved fallback is text, not a structured result or a recreated conversation.
    assert.equal(result.structuredContent, undefined);
    assert.doesNotMatch(text(result), /--- Agent Conversation ---/);
  }
  const exact = await facade.execute("exact", { op: "result", agent_id: "old-id" }, undefined, undefined, ctx);
  assert.match(text(exact), /Old output/);
  const missing = await facade.execute("missing", { op: "result", agent_id: "unknown" }, undefined, undefined, ctx);
  assert.match(text(missing), /Agent not found/);
});

test("saved resume refusal is delegated without spawning or substituting agent type", async () => {
  const ctx = { cwd, ui: {}, sessionManager: { getBranch: () => [record("unsaved-id", "Saved output")] } };
  const result = await facade.execute("resume", { op: "run", prompt: "Continue", description: "Continue saved task", subagent_type: "Explore", input: JSON.stringify({ resume: "unsaved-id", run_in_background: false }) }, undefined, undefined, ctx);
  assert.match(text(result), /cannot be resumed/);
  assert.match(text(result), /conversation was not saved/);
});
