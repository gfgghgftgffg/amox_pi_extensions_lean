#!/usr/bin/env node
// Optional npm publication. Runs only on reviewed main, after GitHub Release;
// publishes prebuilt archives with lifecycle scripts disabled. Never installs
// or imports proposed/upstream package code with the npm token present.
import { checkedRun, run } from "./lib/process.mjs";
import { validateReleaseAssets } from "./release-assets.mjs";

try {
  if (!process.env.NODE_AUTH_TOKEN) throw new Error("Configure the NPM_TOKEN secret before enabling PUBLISH_NPM");
  const assets = validateReleaseAssets({ repoRoot: process.cwd(), dir: ".release-assets" });
  const version = JSON.parse((await import("node:fs")).readFileSync("package.json", "utf8")).version;
  for (const asset of assets) {
    const existing = run("npm", ["view", `${asset.package}@${version}`, "dist.integrity", "--json", "--registry=https://registry.npmjs.org/"]);
    if (!existing.error && existing.status === 0 && existing.stdout.trim()) {
      if (JSON.parse(existing.stdout) !== asset.integrity) throw new Error(`Existing immutable npm version has different bytes: ${asset.package}@${version}`);
      console.log(`Already published identical archive: ${asset.package}@${version}`);
      continue;
    }
    if (existing.error || !/E404|404 Not Found/.test(existing.stderr || existing.stdout || "")) throw new Error(`Cannot establish npm publication state for ${asset.package}; refusing to publish blindly`);
    checkedRun("npm", ["publish", asset.path, "--ignore-scripts", "--access=public", "--registry=https://registry.npmjs.org/"]);
    console.log(`Published ${asset.package}@${version}`);
  }
} catch (error) { console.error(`npm publication failed: ${error.message}`); process.exitCode = 1; }
