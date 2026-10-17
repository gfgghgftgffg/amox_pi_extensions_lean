#!/usr/bin/env node
// Publish only the three archives produced by Release verification. No package
// installation, build, lifecycle hook, model call or automatic publish retry.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { validateReleaseAssets } from "./release-assets.mjs";
import { packageEntries } from "./lib/extension-package.mjs";
import { readJson } from "./lib/files.mjs";
import { validateReleaseContext } from "./lib/release-validation.mjs";
import { compareExactStableVersions } from "./lib/semver.mjs";

export const NPM_REGISTRY = "https://registry.npmjs.org";
const PUBLISHED_FILES = ["LICENSE", "MAINTENANCE.md", "README.md", "README.zh-CN.md", "index.ts", "package.json"];

// These npm packs have six short regular paths. Reject links, extra files and
// nonstandard headers instead of extracting an untrusted archive on the host.
export function validateNpmArchive({ repoRoot, asset, entry, version, repository }) {
  const tar = gunzipSync(readFileSync(asset.path), { maxOutputLength: 20_000_000 });
  const files = new Map();
  const text = (header, start, size) => header.subarray(start, start + size).toString("utf8").split("\0", 1)[0];
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const sizeText = text(header, 124, 12).trim();
    if (!/^[0-7]+$/.test(sizeText)) throw new Error("Unsupported npm archive size header");
    const size = Number.parseInt(sizeText, 8), name = text(header, 0, 100), prefix = text(header, 345, 155);
    const checksum = Number.parseInt(text(header, 148, 8).trim(), 8);
    const computed = header.reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0);
    if (checksum !== computed || prefix || ![0, 48].includes(header[156]) || offset + 512 + size > tar.length) throw new Error("Unsupported or corrupt npm archive header");
    const path = name.startsWith("package/") ? name.slice(8) : "";
    if (!PUBLISHED_FILES.includes(path) || files.has(path)) throw new Error("Unexpected npm archive path/type");
    files.set(path, tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (files.size !== PUBLISHED_FILES.length || tar.subarray(offset).some((byte) => byte !== 0)) throw new Error("Incomplete npm package archive or unexpected trailing data");
  const pkg = JSON.parse(files.get("package.json").toString("utf8"));
  const expected = readJson(resolve(repoRoot, entry.path, "package.json"));
  if (!isDeepStrictEqual(pkg, expected) || pkg.name !== entry.packageName || pkg.version !== version
    || pkg.private || pkg.publishConfig?.access !== "public" || pkg.publishConfig?.registry
    || pkg.repository?.url !== `git+https://github.com/${repository}.git`
    || pkg.repository?.directory !== entry.path) throw new Error("Npm package identity/source/config mismatch");
  for (const file of PUBLISHED_FILES.filter((file) => file !== "package.json")) {
    if (!files.get(file).equals(readFileSync(resolve(repoRoot, entry.path, file)))) throw new Error(`Npm archive differs from verified checkout: ${entry.id}/${file}`);
  }
  return pkg;
}

async function registryMetadata(name, version, fetchImpl) {
  const path = `/${encodeURIComponent(name)}${version ? `/${version}` : ""}`;
  let response;
  try { response = await fetchImpl(NPM_REGISTRY + path, { redirect: "error", signal: AbortSignal.timeout(30_000), headers: { accept: "application/json", "cache-control": "no-cache" } }); }
  catch { throw new Error(`Public npm lookup failed for ${name}; no publish retry`); }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Public npm lookup HTTP ${response.status} for ${name}`);
  const data = await response.json();
  if (data.name !== name || (version && data.version !== version)) throw new Error("Public npm metadata identity mismatch");
  return data;
}
function matchesIntegrity(metadata, asset) {
  return typeof metadata?.dist?.integrity === "string" && metadata.dist.integrity.split(/\s+/).includes(asset.integrity);
}
// A successful upload can precede anonymous registry visibility. Only GETs
// wait here; hash/identity conflicts fail immediately and publish is never retried.
export async function waitForPublishedArchive({ asset, version, fetchImpl = fetch, timeoutMs = 180_000, pollMs = 5_000, sleep = delay, now = Date.now, log = console.log }) {
  const deadline = now() + timeoutMs;
  let announced = false;
  while (true) {
    const actual = await registryMetadata(asset.package, version, fetchImpl);
    if (actual && !matchesIntegrity(actual, asset)) throw new Error(`Published npm integrity conflicts with verified archive: ${asset.package}@${version}; no publish retry`);
    if (actual) {
      const metadata = await registryMetadata(asset.package, null, fetchImpl);
      const latest = metadata?.["dist-tags"]?.latest;
      if (latest === version) return;
      if (latest && compareExactStableVersions(latest, version) > 0) throw new Error(`Published npm latest advanced unexpectedly: ${asset.package}@${version}; no automatic tag mutation`);
    }
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error(`Registry visibility wait timed out: ${asset.package}@${version}. Upload may already have succeeded; inspect exact version before recovery, no publish retry`);
    if (!announced) { log(`Upload returned success; waiting for public registry version/integrity/latest visibility: ${asset.package}@${version} (GET only)`); announced = true; }
    await sleep(Math.min(pollMs, remaining));
  }
}

export function publishArchive(path, spawn = spawnSync) {
  const args = ["publish", path, "--access", "public", "--tag", "latest", "--ignore-scripts", "--fetch-retries=0", "--registry", NPM_REGISTRY];
  const result = spawn("npm", args, { encoding: "utf8", timeout: 5 * 60_000, maxBuffer: 2_000_000,
    env: { ...process.env, NODE_AUTH_TOKEN: "", NPM_TOKEN: "", NPM_CONFIG_IGNORE_SCRIPTS: "true" } });
  if (result.error || result.status !== 0) {
    const code = `${result.stderr || ""}\n${result.stdout || ""}`.match(/\bE(?:NEEDAUTH|OTP|401|403|404|PUBLISHCONFLICT|PRIVATE)\b/)?.[0] || "unknown";
    throw new Error(`npm publish failed or outcome uncertain (exit=${result.status}, code=${code}). Inspect this exact registry version before an explicit retry; no response body or automatic retry.`);
  }
}

export async function publishNpmArchives({ repoRoot, dir, repository, dryRun = true, fetchImpl = fetch, publish = publishArchive, log = console.log }) {
  const rootPackage = readJson(resolve(repoRoot, "package.json"));
  if (rootPackage.private !== true) throw new Error("Workspace root must remain private");
  const version = rootPackage.version;
  const entries = packageEntries(repoRoot);
  const assets = validateReleaseAssets({ repoRoot, dir });
  // Validate every archive and preflight every registry identity before the
  // first write. Known conflicts/first-publication setup cannot half-publish.
  for (const asset of assets) {
    const entry = entries.find((entry) => entry.packageName === asset.package);
    validateNpmArchive({ repoRoot, asset, entry, version, repository });
  }
  const plan = [];
  for (const asset of assets) {
    const existing = await registryMetadata(asset.package, version, fetchImpl);
    if (existing && !matchesIntegrity(existing, asset)) throw new Error(`Immutable npm version conflicts with verified archive: ${asset.package}@${version}`);
    const packageMetadata = await registryMetadata(asset.package, null, fetchImpl);
    if (!packageMetadata) throw new Error(`Initial npm publication is still required for ${asset.package}; follow docs/npm-publishing.md before enabling OIDC publishing`);
    const latest = packageMetadata["dist-tags"]?.latest;
    if (latest && !existing && compareExactStableVersions(latest, version) > 0) throw new Error(`Refusing to move npm latest backwards: ${asset.package}@${version}`);
    if (existing && (!latest || compareExactStableVersions(latest, version) < 0)) throw new Error(`Existing npm version matches but latest needs manual review: ${asset.package}@${version}`);
    plan.push({ asset, exists: Boolean(existing) });
  }
  const completed = [];
  for (const { asset, exists } of plan) {
    if (exists) { log(`Already published, matching verified integrity: ${asset.package}@${version}`); completed.push(asset.package); continue; }
    if (dryRun) { log(`Would publish verified archive: ${asset.package}@${version}`); continue; }
    try { await publish(asset.path); }
    catch (error) { throw new Error(`${asset.package}@${version}: ${error.message} Previously completed packages: ${completed.join(", ") || "none"}. Never unpublish or overwrite to recover.`); }
    await waitForPublishedArchive({ asset, version, fetchImpl, log });
    completed.push(asset.package);
    log(`Published and registry integrity verified: ${asset.package}@${version}`);
  }
  return { version, packages: assets.map((asset) => asset.package), dryRun };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), index = args.indexOf("--assets-dir");
    if (index < 0 || !args[index + 1] || args.some((arg, i) => i !== index + 1 && !["--assets-dir", "--publish", "--dry-run"].includes(arg))
      || (args.includes("--publish") && args.includes("--dry-run"))) throw new Error("Usage: node scripts/publish-npm.mjs --assets-dir DIR [--dry-run | --publish]");
    const repoRoot = process.cwd(), dryRun = !args.includes("--publish");
    const headSha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim();
    const errors = validateReleaseContext({ tag: process.env.RELEASE_TAG, packageVersion: readJson(resolve(repoRoot, "package.json")).version,
      expectedSha: process.env.EXPECTED_SHA, headSha });
    if (errors.length) throw new Error(errors.join("; "));
    if (!/^[-\w.]+\/[-\w.]+(?![\s\S])/.test(process.env.GITHUB_REPOSITORY || "")) throw new Error("Missing/invalid repository identity");
    if (!dryRun && (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF !== "refs/heads/main"
      || !["push", "workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME)
      || !process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)) throw new Error("Real npm publication requires the main-branch GitHub-hosted OIDC Release job");
    await publishNpmArchives({ repoRoot, dir: resolve(args[index + 1]), repository: process.env.GITHUB_REPOSITORY, dryRun });
  } catch (error) { console.error(`Npm publication stopped: ${error.message}`); process.exitCode = 1; }
}
