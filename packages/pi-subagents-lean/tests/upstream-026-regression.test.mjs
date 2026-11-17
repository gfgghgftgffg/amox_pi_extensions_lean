import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

// Isolate configuration before importing the actual published dist runtime.
const root = mkdtempSync(join(tmpdir(), "subagents-026-facade-"));
const agentDir = join(root, "agent");
const cwd = join(root, "project");
mkdirSync(agentDir, { recursive: true });
mkdirSync(cwd, { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
const previousCwd = process.cwd();
process.chdir(cwd);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { createSubagentsFacade } = await jiti.import(fileURLToPath(new URL("../index.ts", import.meta.url)));

function loadFacade(settings) {
  writeFileSync(join(agentDir, "subagents.json"), JSON.stringify(settings));
  const tools = [];
  const noop = () => undefined;
  const pi = new Proxy({
    registerTool: tool => tools.push(tool),
    events: { on: noop, emit: noop },
  }, { get: (target, key) => target[key] ?? noop });
  createSubagentsFacade()(pi);
  assert.deepEqual(tools.map(tool => tool.name), ["subagent"]);
  return tools[0];
}

test("workflow exposure changes on-demand help while retaining the single facade", async () => {
  try {
    for (const mode of ["inline", "skill", "deferred"]) {
      const facade = loadFacade({ workflowToolExposure: mode });
      assert.equal(facade.exposure, undefined);
      assert.match(facade.promptGuidelines.join("\n"), /workflow requires an explicit workflow request/);
      const response = await facade.execute("help-workflow", { op: "help", input: "workflow" });
      const text = response.content[0].text;
      assert.match(text, /ONLY call this tool when the user has explicitly opted/);
      assert.match(text, /"scriptPath"/);
      assert.match(text, /"resumeFromRunId"/);
      if (mode === "skill") {
        const path = text.match(/read `([^`]+SKILL\.md)`/)?.[1];
        assert.ok(path, "skill help must include the upstream absolute reference path");
        assert.ok(existsSync(path), "published runtime must ship the referenced skill");
        assert.match(readFileSync(path, "utf8"), /agentError/);
        assert.doesNotMatch(text, /its full text follows/);
      } else {
        assert.match(text, /its full text follows/);
        assert.match(text, /agentError/);
      }
      // Exercise upstream authoring validation without launching a worker/model.
      const result = await facade.execute("invalid-workflow", {
        op: "workflow", input: JSON.stringify({ script: "return 1;" }),
      }, undefined, undefined, { cwd });
      assert.equal(result.content[0].type, "text");
      assert.match(result.content[0].text, /meta/);
      assert.equal(result.structuredContent, undefined);
      assert.equal(result.details?.taskId, undefined);
    }
    const disabled = loadFacade({ workflowsEnabled: false, workflowToolExposure: "deferred" });
    const result = await disabled.execute("disabled", { op: "workflow", input: "{}" });
    assert.match(result.content[0].text, /operation is unavailable: workflow/);
  } finally {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  }
});
