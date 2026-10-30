#!/usr/bin/env node
import { loadCheckScope, checkCommands } from "./lib/check-scope.mjs";
import { run } from "./lib/process.mjs";

try {
  const stage = process.argv[2], index = ["check", "contracts", "production"].indexOf(stage);
  if (index < 0 || process.argv.length !== 3) throw new Error("Usage: node scripts/check-changes.mjs check|contracts|production");
  const scope = loadCheckScope(process.cwd(), process.env.AMOX_CHECK_BASE);
  console.log(`Verification scope: ${JSON.stringify(scope)}`);
  const [command, args] = checkCommands(scope)[index];
  const result = run(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`Verification failed: ${result.error?.message ?? result.status}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
