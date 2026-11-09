import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertSafeRelativePath, fileInventory, jsonText } from "./files.mjs";
import { writePrivateJson } from "./maintenance-retries.mjs";
import { RemoteHttpError } from "./remote-errors.mjs";

const LIMIT = 10_000_000;
export function assertForkPolicy(original, actual) {
  const section = text => {
    text = text.replaceAll("\r\n", "\n");
    const marker = "## 功能取舍与维护边界\n", start = text.indexOf(marker);
    if (start < 0) throw new Error("Missing fork feature policy; owner review required");
    const end = text.indexOf("\n## ", start + marker.length);
    return text.slice(start, end < 0 ? text.length : end);
  };
  if (section(original) !== section(actual)) throw new Error("Automatic adaptation cannot change the owner's fork feature decisions");
}

export const FORK_AREAS = ["raw-sync", "safe-paths", "backups", "diagnostics", "automation", "manual-cleanup", "ui", "removed-feature", "irrelevant", "uncertain"];
const RETAINED = new Set(FORK_AREAS.slice(0, 7));
async function bytes(response) {
  if (!response.ok) throw new RemoteHttpError(`Published fork source HTTP ${response.status}`, { httpStatus: response.status, phase: "upstream-read" });
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > LIMIT) throw new Error("Published source response exceeds size limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Parse regular ustar files in memory. Never extract links, run npm hooks or
// trust archive paths; unsupported headers fail closed for human review.
export function publishedTextFiles(archive, integrity) {
  if (typeof integrity !== "string" || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)
    || `sha512-${createHash("sha512").update(archive).digest("base64")}` !== integrity) throw new Error("Published source integrity mismatch");
  const tar = gunzipSync(archive, { maxOutputLength: 40_000_000 }), files = new Map();
  const field = (h, a, n) => h.subarray(a, a + n).toString("utf8").split("\0", 1)[0];
  let offset = 0;
  for (; offset + 512 <= tar.length; ) {
    const h = tar.subarray(offset, offset + 512);
    if (h.every(b => b === 0)) break;
    const octal = (a, n) => { const text = field(h, a, n).trim(); if (!/^[0-7]+$/.test(text)) throw new Error("Invalid archive number"); return parseInt(text, 8); };
    const size = octal(124, 12), checksum = octal(148, 8);
    const computed = h.reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0);
    const name = [field(h, 345, 155), field(h, 0, 100)].filter(Boolean).join("/");
    if (computed !== checksum || ![0, 48, 53].includes(h[156]) || !name.startsWith("package/") || offset + 512 + size > tar.length) throw new Error("Unsupported published archive header");
    const path = name.slice(8).replace(/\/$/, "");
    if (path) assertSafeRelativePath(path);
    if (h[156] !== 53) {
      if (!path || files.has(path)) throw new Error("Duplicate or empty published source path");
      const value = tar.subarray(offset + 512, offset + 512 + size);
      if (size > 2_000_000 || value.includes(0)) throw new Error("Non-text or oversized published source file requires human review");
      files.set(path, value.toString("utf8"));
      if (files.size > 10000) throw new Error("Too many source files");
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!files.size || tar.subarray(offset).some(b => b !== 0)) throw new Error("Incomplete published source archive");
  return files;
}

export async function fetchPublishedSource(name, version, { fetchImpl = fetch } = {}) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`;
  const metadata = JSON.parse((await bytes(await fetchImpl(url, { signal: AbortSignal.timeout(30000), redirect: "error" }))).toString("utf8"));
  if (metadata.name !== name || metadata.version !== version) throw new Error("Published source identity mismatch");
  const tarball = new URL(metadata.dist?.tarball);
  if (tarball.protocol !== "https:" || tarball.hostname !== "registry.npmjs.org" || tarball.port || tarball.username || tarball.password || tarball.search || tarball.hash) throw new Error("Untrusted published source URL");
  const archive = await bytes(await fetchImpl(tarball.href, { signal: AbortSignal.timeout(30000), redirect: "error" }));
  const files = publishedTextFiles(archive, metadata.dist.integrity);
  const pkg = JSON.parse(files.get("package.json"));
  if (pkg.name !== name || pkg.version !== version) throw new Error("Archive package identity mismatch");
  return { files, integrity: metadata.dist.integrity };
}

export function changedSourceFiles(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])].filter(path => before.get(path) !== after.get(path)).sort();
}
export function validateForkReview(review, changedFiles) {
  if (!review || !Array.isArray(review.changes) || !review.changes.length || review.changes.length > 200) throw new Error("Missing per-change fork review");
  const covered = new Set();
  for (const item of review.changes) {
    if (!["port", "skip", "ask"].includes(item.decision) || !FORK_AREAS.includes(item.area)
      || typeof item.reason !== "string" || item.reason.trim().length < 10 || item.reason.length > 2000
      || !Array.isArray(item.files) || !item.files.length || item.files.some(p => !changedFiles.includes(p))) throw new Error("Invalid fork change decision or evidence");
    if (item.decision === "port" && !RETAINED.has(item.area)) throw new Error("Only retained functionality can be ported automatically");
    if (item.decision === "skip" && !["removed-feature", "irrelevant"].includes(item.area)) throw new Error("Retained or uncertain functionality cannot be silently skipped");
    item.files.forEach(path => covered.add(path));
  }
  if (changedFiles.some(path => !covered.has(path))) throw new Error("Every changed published file must be covered by the review");
  return { decision: review.changes.some(item => item.decision === "ask") ? "ask" : review.changes.some(item => item.decision === "port") ? "port" : "skip", changes: review.changes };
}

export function deferForkReview(stateRoot, report, { reason, files }) {
  const deferred = { ...report, decision: "ask", deferredDuringAdaptation: true, localFiles: files,
    changes: [...report.changes, { decision: "ask", area: "uncertain", files: report.changedFiles,
      reason: `移植候选出现待确认问题：${reason}` }] };
  validateForkReview(deferred, deferred.changedFiles);
  writePrivateJson(join(stateRoot, `fork-review-${report.id}.json`), deferred);
  return deferred;
}

// Same target + local implementation + policy is reviewed once. A skipped or
// pending review does not advance the integrated manifest baseline. Ports are
// deliberately not cached: a failed candidate must never be mistaken as merged.
export async function reviewSelectiveForks({ repo, stateRoot, runDir, manifest, plan, review,
  source = fetchPublishedSource, now = () => new Date().toISOString() }) {
  const reports = [];
  mkdirSync(join(runDir, "context"), { recursive: true });
  for (const fork of (plan.forkPlans ?? []).filter(p => p.changed)) {
    const entry = manifest.packages.find(e => e.id === fork.id);
    const policy = readFileSync(join(repo, entry.path, "MAINTENANCE.md"), "utf8");
    const local = fileInventory(join(repo, entry.path)).map(path => [path, readFileSync(join(repo, entry.path, path), "utf8")]);
    const key = createHash("sha256").update(jsonText({ reviewSchema: 1, fork, entry, policy, local })).digest("hex");
    const cachePath = join(stateRoot, `fork-review-${entry.id}.json`);
    let cached;
    try { cached = JSON.parse(readFileSync(cachePath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw new Error("Invalid saved fork review; inspect before continuing"); }
    let report;
    if (cached?.key === key && !cached.recheck) {
      const validated = validateForkReview(cached, cached.changedFiles);
      if (validated.decision === "port") throw new Error("A pending port cannot be loaded from review cache");
      report = { ...cached, ...validated, cached: true };
    } else {
      let before, after;
      try {
        before = await source(entry.upstreamPackage, fork.currentVersion);
        after = await source(entry.upstreamPackage, fork.latestVersion);
      } catch (error) {
        if (error instanceof RemoteHttpError && [500, 502, 503, 504].includes(error.httpStatus)) throw error;
        report = { id: entry.id, from: fork.currentVersion, to: fork.latestVersion, key, reviewedAt: now(), recheck: true,
          changedFiles: ["SOURCE_REVIEW_UNAVAILABLE"], decision: "ask", changes: [{ decision: "ask", area: "uncertain", files: ["SOURCE_REVIEW_UNAVAILABLE"],
            reason: "无法获取或验证完整的上游发布源码，不能判断是否值得移植，请人工检查；本次未改动 sync。" }] };
        writePrivateJson(cachePath, report);
        fork.decision = "ask"; fork.review = report; reports.push(report); continue;
      }
      const changedFiles = changedSourceFiles(before.files, after.files);
      for (const [revision, material] of [["before", before], ["after", after]]) {
        for (const [path, content] of material.files) {
          assertSafeRelativePath(path);
          const target = join(runDir, "context", entry.id, `upstream-${revision}`, path);
          mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content);
        }
      }
      const evidence = { id: entry.id, from: fork.currentVersion, to: fork.latestVersion, changedFiles,
        contextDirectory: join(runDir, "context", entry.id),
        beforeIntegrity: before.integrity, afterIntegrity: after.integrity };
      writeFileSync(join(runDir, "context", `${entry.id}-diff.json`), jsonText(evidence));
      let validated, recheck = false;
      try { validated = validateForkReview(await review({ entry, fork, evidence, policy }), changedFiles); }
      catch (error) {
        if (error instanceof RemoteHttpError) throw error;
        recheck = true;
        validated = { decision: "ask", changes: [{ decision: "ask", area: "uncertain", files: changedFiles,
          reason: "审查未产生完整、有效的逐项决策，不能自动判断；请人工查看发布差异后决定是否移植。" }] };
      }
      report = { ...evidence, ...validated, key, reviewedAt: now(), ...(recheck ? { recheck: true } : {}) };
      if (report.decision !== "port") writePrivateJson(cachePath, report);
    }
    fork.decision = report.decision;
    fork.review = report;
    reports.push(report);
  }
  return reports;
}
