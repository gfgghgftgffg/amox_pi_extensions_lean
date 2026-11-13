import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createLocalTools } from "../scripts/lib/local-pi.mjs";

const subagents = "pi-subagents-lean", goal = "pi-goal-x-lean";
const entries = JSON.parse(readFileSync(new URL("../maintenance/manifest.json", import.meta.url), "utf8"))
  .packages.filter(entry => [subagents, goal].includes(entry.id));

for (const updated of [subagents, goal]) {
  test(`check preflight handles an original facade without a lean plan when ${updated} updates`, async () => {
    const root = mkdtempSync(join(tmpdir(), "amox-original-check-"));
    const repo = join(root, "repo"), context = join(root, "context");
    const write = (base, path, text) => {
      const target = join(base, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, text);
    };
    for (const entry of entries) write(repo, `${entry.path}/MAINTENANCE.md`, "# Local adaptation contract\n");
    const source = updated === goal ? "extensions/goal.ts" : "src/index.ts";
    for (const revision of ["before", "after"]) write(context, `${updated}/upstream-${revision}/${source}`, "// Published source fixture\n");
    const plan = {
      packagePlans: entries.map(entry => ({ id: entry.id, versionChange: entry.id === updated ? "bump" : "none" })),
      leanPlans: [{ id: subagents, changed: false }],
      forkPlans: [],
    };
    let gateCalls = 0;
    const outcomes = [];
    const summary = "- Preserve local integration behavior while updating the upstream dependency.";
    const gate = {
      invalidate() { assert.fail("Preflight must not mutate this fixture"); },
      async check(actualSummary) {
        assert.equal(actualSummary, summary); gateCalls++;
        return { ok: true, output: "Preflight reached the command gate." };
      },
    };
    try {
      const tools = createLocalTools({ repo, context, manifest: { packages: entries }, plan, baseline: new Map(), gate,
        onCheckResult: ok => outcomes.push(ok) });
      const read = tools.find(tool => tool.name === "read");
      const check = () => tools.find(tool => tool.name === "check").execute("check", { summary });
      await assert.rejects(check(), new RegExp(`Read ${updated} maintenance notes first`));
      assert.equal(gateCalls, 0);
      const entry = entries.find(entry => entry.id === updated);
      await read.execute("notes", { scope: "repo", path: `${entry.path}/MAINTENANCE.md` });
      for (const revision of ["before", "after"]) {
        await assert.rejects(check(), new RegExp(`Read ${updated} upstream-${revision} source first`));
        assert.equal(gateCalls, 0);
        await read.execute(revision, { scope: "upstream", path: `${updated}/upstream-${revision}/${source}` });
      }
      const result = await check();
      assert.equal(result.terminate, true);
      assert.equal(result.content[0].text, "Preflight reached the command gate.");
      assert.equal(gateCalls, 1);
      assert.deepEqual(outcomes, [true]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
