import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { isExactStableVersion } from "./semver.mjs";

export const HEX40 = /^[0-9a-f]{40}(?![\s\S])/;
export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const lfText = (text) => text.replaceAll("\r\n", "\n");
export function nextPatch(version) {
  if (!isExactStableVersion(version)) throw new Error("Version must be canonical stable semver");
  const [major, minor, patch] = version.split(".").map(Number);
  if (!Number.isSafeInteger(patch + 1)) throw new Error("Version overflow");
  return `${major}.${minor}.${patch + 1}`;
}
export function assertSafeRelativePath(path) {
  if (typeof path !== "string" || !path || !/^[A-Za-z0-9_./@-]+(?![\s\S])/.test(path)
    || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Unsafe relative path");
  return path;
}
export function assertRegularPath(root, path, { allowMissing = false } = {}) {
  assertSafeRelativePath(path);
  let current = resolve(root);
  for (const part of path.split("/")) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error("Symlink forbidden");
    } catch (error) { if (!allowMissing || error.code !== "ENOENT") throw error; }
  }
  if (existsSync(current) && !lstatSync(current).isFile()) throw new Error("Not a regular file");
  return current;
}
export function fileInventory(root) {
  const files = [];
  function walk(path = "") {
    for (const item of readdirSync(join(root, path), { withFileTypes: true })) {
      if (item.isSymbolicLink() || [".git", "node_modules", ".pi", ".tmp", "diagnostics"].includes(item.name)) continue;
      const next = path ? `${path}/${item.name}` : item.name;
      if (item.isDirectory()) walk(next);
      else if (item.isFile()) files.push(next);
      if (files.length > 10000) throw new Error("Too many context files");
    }
  }
  walk();
  return files.sort();
}
export function adapterWritable(path, manifest) {
  assertSafeRelativePath(path);
  if (["README.md", "README.zh-CN.md", "maintenance/agent-review.md"].includes(path)) return true;
  return manifest.packages.some((entry) => {
    const rest = path.startsWith(`${entry.path}/`) ? path.slice(entry.path.length + 1) : "";
    return rest === entry.entry || ["README.md", "README.zh-CN.md", "MAINTENANCE.md"].includes(rest)
      || /^tests\/[A-Za-z0-9_-]+\.test\.mjs$/.test(rest);
  });
}
