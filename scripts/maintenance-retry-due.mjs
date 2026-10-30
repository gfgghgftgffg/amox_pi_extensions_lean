#!/usr/bin/env node
// systemd ExecCondition: read-only, no credentials, model or network access.
import { homedir } from "node:os";
import { join } from "node:path";
import { retryIsDue } from "./lib/maintenance-retries.mjs";
try {
  if (process.argv.length !== 2) throw new Error("No arguments supported");
  const root = process.env.AMOX_MAINTENANCE_STATE || join(homedir(), ".local/state/amox-pi-maintenance");
  process.exitCode = retryIsDue(root) ? 0 : 1;
} catch {
  console.error("Maintenance retry state is invalid or unavailable; no automatic run.");
  process.exitCode = 2;
}
