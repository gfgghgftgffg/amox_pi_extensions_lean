import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assertSafeRelativePath } from "./candidate.mjs";
import { isExactStableVersion } from "./semver.mjs";

export const AGENT_REPORT = "maintenance/agent-review.md";
export const HEX40 = /^[0-9a-f]{40}$/;
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const lfText = (text) => text.replaceAll("\r\n", "\n");

export function nextPatch(version) {
  if (!isExactStableVersion(version)) throw new Error("Version must be canonical stable semver");
  const [major, minor, patch] = version.split(".").map(Number);
  if (!Number.isSafeInteger(patch + 1)) throw new Error("Version overflow");
  return `${major}.${minor}.${patch + 1}`;
}

export function assertRegularPath(root, path, { allowMissing = false } = {}) {
  assertSafeRelativePath(path);
  let current = resolve(root);
  for (const part of path.split("/")) {
    current = join(current, part);
    let stat;
    try { stat = lstatSync(current); } catch (error) {
      if (allowMissing && error.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Symlink forbidden: ${path}`);
  }
  if (existsSync(current) && !lstatSync(current).isFile()) throw new Error(`Not a regular file: ${path}`);
  return current;
}

export function agentWritable(path, manifest) {
  assertSafeRelativePath(path);
  if (path === "README.md" || path === AGENT_REPORT) return true;
  return manifest.packages.some((entry) => {
    const prefix = `${entry.path}/`;
    if (!path.startsWith(prefix)) return false;
    const rest = path.slice(prefix.length);
    return rest === entry.entry || ["README.md", "README.zh-CN.md", "MAINTENANCE.md"].includes(rest)
      || /^tests\/[A-Za-z0-9_-]+\.test\.mjs$/.test(rest);
  });
}

export function generatedWritable(path, manifest) {
  return ["package.json", "package-lock.json", "maintenance/manifest.json", "maintenance/tool-contracts.json", "maintenance/update-report.md"].includes(path)
    || manifest.packages.some((entry) => path === `${entry.path}/package.json`);
}

export function validateFiles(files, root, manifest, { generated = false } = {}) {
  if (!Array.isArray(files) || files.length > 100) throw new Error("Invalid file list");
  let total = 0;
  const seen = new Set();
  for (const file of files) {
    if (!file || Object.keys(file).sort().join(",") !== "content,contentSha256,path") throw new Error("Unexpected file fields");
    assertSafeRelativePath(file.path);
    if (seen.has(file.path)) throw new Error(`Duplicate path: ${file.path}`);
    seen.add(file.path);
    if (!agentWritable(file.path, manifest) && !(generated && generatedWritable(file.path, manifest))) throw new Error(`Protected path: ${file.path}`);
    if (typeof file.content !== "string" || Buffer.byteLength(file.content) > 5_000_000 || file.content.includes("\0")) throw new Error("Invalid file content");
    total += Buffer.byteLength(file.content);
    if (sha256(file.content) !== file.contentSha256) throw new Error(`Hash mismatch: ${file.path}`);
    assertRegularPath(root, file.path, { allowMissing: true });
    if (/\/tests\//.test(file.path) && existsSync(join(root, file.path))
      && !lfText(file.content).startsWith(lfText(readFileSync(join(root, file.path), "utf8")))) {
      throw new Error(`Existing tests are append-only: ${file.path}`);
    }
  }
  if (total > 20_000_000) throw new Error("Bundle too large");
  return files;
}

export function applyFiles(root, files) {
  // Validate ALL paths before writing ANY file.
  for (const file of files) assertRegularPath(root, file.path, { allowMissing: true });
  for (const file of files) {
    const target = join(root, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
}

export function reviewIds(plan) {
  return [...new Set([...plan.changedPackageIds, ...plan.leanPlans.filter((item) => item.changed).map((item) => item.id)])].sort();
}

export function validateReview(review, plan) {
  if (!review || Object.keys(review).sort().join(",") !== "ready,reviewedPackages,summary") throw new Error("Invalid agent review");
  if (review.ready !== true) throw new Error("Agent reported unresolved adaptation issues; no PR or release");
  if (!Array.isArray(review.reviewedPackages) || JSON.stringify([...review.reviewedPackages].sort()) !== JSON.stringify(reviewIds(plan))) throw new Error("Agent did not review every changed package");
  if (typeof review.summary !== "string" || review.summary.trim().length < 20 || review.summary.length > 20_000) throw new Error("Missing substantive agent review");
}

export function fileInventory(root, { maxFiles = 10_000 } = {}) {
  const result = [];
  function walk(path = "") {
    for (const item of readdirSync(join(root, path), { withFileTypes: true })) {
      if (item.isSymbolicLink() || [".git", "node_modules", ".pi"].includes(item.name)) continue;
      const next = path ? `${path}/${item.name}` : item.name;
      if (item.isDirectory()) walk(next);
      else if (item.isFile()) result.push(next);
      if (result.length > maxFiles) throw new Error("Too many context files");
    }
  }
  walk();
  return result.sort();
}
