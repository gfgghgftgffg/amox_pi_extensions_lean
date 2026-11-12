import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkedRun } from "./process.mjs";
import { assertSafeRelativePath, HEX40, jsonText } from "./files.mjs";
import { gitReadHttpError } from "./remote-errors.mjs";
import { fetchPublishedSource } from "./fork-review.mjs";
import { isExactStableVersion } from "./semver.mjs";

// Resolve exact Git commits or explicitly selected npm publications only.
// Neither source is installed, imported, or run in the agent job.
export async function collectSources({ repoRoot, outDir, plan, manifest, source = fetchPublishedSource,
  runGit = (args, options) => checkedRun("git", args, options) }) {
  mkdirSync(join(outDir, "context"), { recursive: true });
  const scratch = mkdtempSync(join(outDir, ".source-work-"));
  let total = 0;
  const records = [];
  function materialize(repository, revision, destination, subdir, relatedDirectories = []) {
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(repository) || !HEX40.test(revision)) throw new Error("Invalid source identity");
    const work = join(scratch, String(records.length));
    mkdirSync(work, { recursive: true });
    runGit(["-c", "core.hooksPath=/dev/null", "init", "--quiet"], { cwd: work });
    runGit(["remote", "add", "origin", repository], { cwd: work });
    try {
      runGit(["-c", "core.hooksPath=/dev/null", "fetch", "--quiet", "--depth=1", "origin", revision], { cwd: work, timeout: 90_000 });
    } catch (error) { throw gitReadHttpError(error.stderr ?? error.message) ?? error; }
    runGit(["-c", "core.hooksPath=/dev/null", "-c", "core.autocrlf=false", "checkout", "--quiet", "--detach", revision], { cwd: work });
    if (runGit(["rev-parse", "HEAD"], { cwd: work }).trim() !== revision) throw new Error("Source checkout revision mismatch");
    const target = join(outDir, "context", destination);
    mkdirSync(target, { recursive: true });
    if (subdir) assertSafeRelativePath(subdir);
    for (const path of relatedDirectories) assertSafeRelativePath(path);
    const source = subdir ? join(work, subdir) : work;
    const filter = (path) => {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) return false;
      if (stat.isDirectory()) return ![".git", "node_modules", ".pi"].includes(path.split(/[\\/]/).at(-1));
      if (!stat.isFile() || stat.size > 2_000_000) return false;
      const bytes = readFileSync(path);
      if (bytes.includes(0)) return false;
      total += bytes.length;
      if (total > 80_000_000) throw new Error("Upstream text context exceeds 80 MB");
      return true;
    };
    cpSync(source, target, { recursive: true, filter });
    for (const path of relatedDirectories) {
      cpSync(join(work, path), join(target, `RELATED-${path.split("/").at(-1)}`), { recursive: true, filter });
    }
    // Preserve root changelog/readme when source is inside a monorepo.
    if (subdir) {
      for (const file of readdirSync(work)) {
        if (/^(CHANGELOG|CHANGES|README)(\.[\w-]+)*$/i.test(file) && lstatSync(join(work, file)).isFile()) {
          const from = join(work, file);
          if (filter(from)) cpSync(from, join(target, `ROOT-${file}`));
        }
      }
    }
    records.push({ repository, revision, path: destination, directory: subdir ?? ".", relatedDirectories });
  }
  async function materializeNpm(name, version, ref, destination) {
    if (!isExactStableVersion(version) || ref !== `npm:${name}@${version}`) throw new Error("Invalid published source identity");
    const material = await source(name, version);
    for (const [path, content] of material.files) {
      assertSafeRelativePath(path);
      total += Buffer.byteLength(content);
      if (total > 80_000_000) throw new Error("Upstream text context exceeds 80 MB");
      const target = join(outDir, "context", destination, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    records.push({ source: "npm", ref, integrity: material.integrity, path: destination });
  }
  try {
    for (const entry of manifest.packages) {
      if (["manual-fork", "selective-fork"].includes(entry.maintenanceMode)) continue;
      const pkgPlan = plan.packagePlans.find((item) => item.id === entry.id);
      const leanPlan = plan.leanPlans.find((item) => item.id === entry.id);
      if (pkgPlan.versionChange === "bump") {
        if (entry.upstreamSource === "npm") {
          await materializeNpm(entry.upstreamPackage, entry.upstreamVersion, entry.upstreamRef, `${entry.id}/upstream-before`);
          await materializeNpm(entry.upstreamPackage, pkgPlan.latestVersion, pkgPlan.upstreamRef, `${entry.id}/upstream-after`);
        } else {
          materialize(entry.upstreamRepository, entry.upstreamGitHead, `${entry.id}/upstream-before`, entry.upstreamRepositoryDirectory, entry.upstreamRelatedDirectories);
          materialize(entry.upstreamRepository, pkgPlan.upstreamGitHead, `${entry.id}/upstream-after`, entry.upstreamRepositoryDirectory, entry.upstreamRelatedDirectories);
        }
      }
      if (entry.maintenanceMode !== "original-facade" && leanPlan.changed) {
        materialize(entry.leanRepository, entry.leanCommit, `${entry.id}/lean-before`);
        materialize(entry.leanRepository, leanPlan.remoteHead, `${entry.id}/lean-after`);
      }
    }
    writeFileSync(join(outDir, "context", "sources.json"), jsonText(records));
    return records;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
