import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../scripts/lib/process.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test("selected contract capture reports only web and preserves every unselected snapshot record", { timeout: 120_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-selected-contracts-"));
  try {
    const invoke = (args) => run(process.execPath, ["scripts/capture-contracts.mjs", ...args], { cwd: root, timeout: 55_000 });
    const report = invoke(["--packages", "pi-web-access-lean"]);
    assert.equal(report.status, 0, report.stderr);
    assert.match(report.stdout, /pi-web-access-lean/);
    assert.doesNotMatch(report.stdout, /pi-subagents-lean|rpiv-todo-lean/);
    const output = join(dir, "contracts.json"), baselinePath = join(root, "maintenance/tool-contracts.json");
    const before = readFileSync(baselinePath, "utf8");
    const captured = invoke(["--packages", "pi-web-access-lean", "--output", output]);
    assert.equal(captured.status, 0, captured.stderr);
    assert.equal(readFileSync(baselinePath, "utf8"), before);
    const baseline = JSON.parse(before), actual = JSON.parse(readFileSync(output, "utf8"));
    for (const key of ["lean", "upstream"]) for (const [name, record] of Object.entries(baseline[key])) {
      if (["@gfgghgftgffg/pi-web-access-lean", "pi-web-access"].includes(name)) continue;
      assert.deepEqual(actual[key][name], record, `${key}/${name} must remain unchanged`);
    }
    const invalid = invoke(["--packages", "unknown"]);
    assert.notEqual(invalid.status, 0); assert.match(invalid.stderr, /selection/);
    const typo = invoke(["--package", "pi-web-access-lean"]);
    assert.notEqual(typo.status, 0); assert.match(typo.stderr, /Unsupported/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
