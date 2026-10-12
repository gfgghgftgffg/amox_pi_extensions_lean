import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkedRun } from "./process.mjs";
import { assertSafeRelativePath } from "./candidate.mjs";
import { HEX40, jsonText } from "./automation-policy.mjs";

// Resolve source revisions from trusted manifest repositories only. Nothing
// from these repositories is installed, imported, or run in the agent job.
export function collectSources({ repoRoot, outDir, plan, manifest, runGit = (args, options) => checkedRun("git", args, options) }) {
  const scratch = mkdtempSync(join(tmpdir(), "amox-upstream-sources-"));
  let total = 0;
  const records = [];
  function materialize(repository, revision, destination, subdir, relatedDirectories = []) {
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(repository) || !HEX40.test(revision)) throw new Error("Invalid source identity");
    const work = join(scratch, String(records.length));
    mkdirSync(work, { recursive: true });
    runGit(["-c", "core.hooksPath=/dev/null", "init", "--quiet"], { cwd: work });
    runGit(["remote", "add", "origin", repository], { cwd: work });
    runGit(["-c", "core.hooksPath=/dev/null", "fetch", "--quiet", "--depth=1", "origin", revision], { cwd: work, timeout: 90_000 });
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
  try {
    for (const entry of manifest.packages) {
      const pkgPlan = plan.packagePlans.find((item) => item.id === entry.id);
      const leanPlan = plan.leanPlans.find((item) => item.id === entry.id);
      if (pkgPlan.versionChange === "bump") {
        materialize(entry.upstreamRepository, entry.upstreamGitHead, `${entry.id}/upstream-before`, entry.upstreamRepositoryDirectory, entry.upstreamRelatedDirectories);
        materialize(entry.upstreamRepository, pkgPlan.upstreamGitHead, `${entry.id}/upstream-after`, entry.upstreamRepositoryDirectory, entry.upstreamRelatedDirectories);
      }
      if (leanPlan.changed) {
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
