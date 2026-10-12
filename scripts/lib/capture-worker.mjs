/**
 * Capture worker: loads ONE extension entrypoint in an isolated Pi session and
 * writes its registered tool contracts to a result file.
 *
 * Spawned by scripts/capture-contracts.mjs (one process per target) and by
 * phase 2 maintenance tooling. Input JSON: { id, extensionPath, resultPath,
 * hostModulePath }.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createIsolatedEnvironment, isolatedEnvironmentVariables, loadExtensionContracts, resolveHostModulePath } from "./isolated-pi-session.mjs";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node capture-worker.mjs <input.json>");

const input = JSON.parse(readFileSync(inputPath, "utf8"));

const isolated = createIsolatedEnvironment({ prefix: `amox-${input.id}-` });
try {
  // Resolve the host before HOME is redirected to the isolated env.
  const hostModulePath = input.hostModulePath ?? resolveHostModulePath({ requireFrom: import.meta.url });
  process.chdir(isolated.cwd);
  Object.assign(process.env, isolatedEnvironmentVariables(isolated));
  const result = await loadExtensionContracts({
    extensionPath: input.extensionPath,
    hostModulePath,
    env: isolated,
  });
  writeFileSync(input.resultPath, `${JSON.stringify({ id: input.id, ...result }, null, 2)}\n`);
} finally {
  isolated.cleanup();
}
