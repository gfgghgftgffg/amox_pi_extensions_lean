#!/usr/bin/env node
// Install ONE extension from this checkout. Does not require npm ci at root.
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installPackedExtension, selectPackage } from "./lib/extension-package.mjs";
import { checkedRun } from "./lib/process.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
if (process.argv.includes("--help")) {
  console.log("node scripts/install-extension.mjs <pi-web-access-lean|rpiv-todo-lean|pi-subagents-lean>");
  process.exit(0);
}
let scratch;
try {
  if (process.argv.length !== 3) throw new Error("Expected exactly one extension id; use --help");
  const entry = selectPackage(repoRoot, id);
  scratch = mkdtempSync(join(tmpdir(), "amox-install-"));
  const prefix = join(homedir(), ".pi", "lean-packages", id);
  const packageDir = installPackedExtension({ repoRoot, entry, prefix, outDir: scratch });
  checkedRun("pi", ["install", packageDir], { cwd: repoRoot });
  console.log(`Installed only ${entry.packageName}. Run this command again after updating the checkout to upgrade it.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}
