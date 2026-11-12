import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { adapterWritable } from "../scripts/lib/files.mjs";

const manifest = JSON.parse(readFileSync(new URL("../maintenance/manifest.json", import.meta.url), "utf8"));
const goal = manifest.packages.find(entry => entry.id === "pi-goal-x-lean");

test("original goal facade declares and permits only its maintained source files", () => {
  assert.equal(goal.maintenanceMode, "original-facade");
  assert.deepEqual(goal.sourceFiles, ["index.ts", "integration.ts", "delegation.ts"]);
  for (const file of goal.sourceFiles) assert.equal(adapterWritable(`${goal.path}/${file}`, manifest), true, file);
  for (const file of ["unknown.ts", "helpers/unknown.ts", "tests/fixtures/auditor.ts", "tests/fixtures/upstream.mjs", "scripts/update.mjs", "package.json", "tsconfig.json"]) {
    assert.equal(adapterWritable(`${goal.path}/${file}`, manifest), false, file);
  }
  for (const file of ["scripts/local-maintenance.mjs", "maintenance/manifest.json", "package-lock.json"]) {
    assert.equal(adapterWritable(file, manifest), false, file);
  }
  for (const file of ["README.md", "README.zh-CN.md", "MAINTENANCE.md", "tests/focused.test.mjs"]) {
    assert.equal(adapterWritable(`${goal.path}/${file}`, manifest), true, file);
  }
});

test("source write expansion requires the original facade mode and explicit whitelist membership", () => {
  const entry = { ...goal, sourceFiles: ["index.ts", "integration.ts"] };
  const writable = (file) => adapterWritable(`${goal.path}/${file}`, { packages: [entry] });
  assert.equal(writable("integration.ts"), true);
  assert.equal(writable("delegation.ts"), false);
  delete entry.sourceFiles;
  assert.equal(writable("index.ts"), true);
  assert.equal(writable("integration.ts"), false);
  entry.sourceFiles = ["index.ts", "integration.ts"];
  delete entry.maintenanceMode;
  assert.equal(writable("index.ts"), true);
  assert.equal(writable("integration.ts"), false);
  entry.maintenanceMode = "manual-fork";
  assert.equal(writable("index.ts"), false);
  assert.equal(writable("integration.ts"), false);
});
