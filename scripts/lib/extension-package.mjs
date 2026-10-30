import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { checkedRun } from "./process.mjs";
import { selectEntries } from "./package-selection.mjs";

export function packageEntries(repoRoot, ids) {
  return selectEntries(JSON.parse(readFileSync(join(repoRoot, "maintenance/manifest.json"), "utf8")).packages, ids);
}

export function selectPackage(repoRoot, id) {
  const entry = packageEntries(repoRoot).find((item) => item.id === id);
  if (!entry) throw new Error(`Choose one extension: ${packageEntries(repoRoot).map((item) => item.id).join(", ")}`);
  return entry;
}

export function packExtension(repoRoot, entry, outDir) {
  mkdirSync(outDir, { recursive: true });
  const output = checkedRun("npm", ["pack", "--ignore-scripts", "--workspaces=false", "--json", "--pack-destination", resolve(outDir)], {
    cwd: join(repoRoot, entry.path),
  });
  const info = JSON.parse(output)[0];
  if (info.name !== entry.packageName || basename(info.filename) !== info.filename || !info.filename.endsWith(".tgz")) {
    throw new Error("Unexpected npm pack result");
  }
  return { ...info, archive: join(resolve(outDir), info.filename) };
}

// Each extension gets its own npm prefix. No workspace links, no sibling
// packages, and no host-provided Pi peers are installed into that prefix.
export function installPackedExtension({ repoRoot, entry, prefix, outDir = mkdtempSync(join(tmpdir(), "amox-pack-")) }) {
  const packed = packExtension(repoRoot, entry, outDir);
  mkdirSync(prefix, { recursive: true });
  checkedRun("npm", ["install", "--prefix", resolve(prefix), "--omit=dev", "--legacy-peer-deps", "--ignore-scripts", "--registry=https://registry.npmjs.org/", packed.archive], {
    cwd: prefix,
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
  });
  return join(resolve(prefix), "node_modules", ...entry.packageName.split("/"));
}
