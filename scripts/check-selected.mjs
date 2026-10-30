#!/usr/bin/env node
import { selectEntries, parsePackageIds, workspaceVersions, releaseEntries } from "./lib/package-selection.mjs";
import { run } from "./lib/process.mjs";

try {
  const args = process.argv.slice(2), ids = parsePackageIds(args);
  if (args.length !== (ids ? 2 : 0)) throw new Error("Usage: node scripts/check-selected.mjs [--packages id,id]");
  const { manifest } = workspaceVersions(process.cwd());
  releaseEntries(process.cwd());
  const selected = selectEntries(manifest.packages, ids);
  const commands = ids === undefined ? [["npm", ["run", "check"]]]
    : selected.map((entry) => ["npm", ["run", "check", "--workspace", entry.path]]);
  for (const [command, argv] of commands) {
    console.log(`Selected check: ${command} ${argv.join(" ")}`);
    const result = run(command, argv, { stdio: "inherit" });
    if (result.error || result.status !== 0) throw new Error(`Selected check failed: ${result.error?.message ?? result.status}`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
