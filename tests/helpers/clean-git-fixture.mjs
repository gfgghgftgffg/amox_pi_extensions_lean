import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function overlay(source, target) {
  // Node's Windows copy-file fast path can fail when overwriting a Git clone.
  // Ordinary read/write preserves the exact bytes without that native path.
  const entries = readdirSync(source, { withFileTypes: true });
  // Mirror deletions as well as additions, only inside the disposable clone.
  // Otherwise a pruned workflow/script survives from HEAD and corrupts tests.
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.isSymbolicLink()) continue;
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) overlay(from, to);
    else if (entry.isFile()) writeFileSync(to, readFileSync(from));
  }
}

/** Current root automation in a TEMP-only clean commit, never the owned tree. */
export function cleanGitFixture(repoRoot) {
  const parent = mkdtempSync(join(tmpdir(), "amox-clean-git-fixture-"));
  const repo = join(parent, "repo");
  try {
    execFileSync("git", ["clone", "--quiet", "--no-hardlinks", "--", repoRoot, repo]);
    const paths = ["scripts", "tests", "docs", ".github", "README.md", "package.json", "package-lock.json", ".gitignore", ".gitattributes", ".npmrc", "maintenance", "packages"];
    for (const path of paths) {
      if (["scripts", "tests", "docs", ".github", "maintenance", "packages"].includes(path)) overlay(join(repoRoot, path), join(repo, path));
      else writeFileSync(join(repo, path), readFileSync(join(repoRoot, path)));
    }
    execFileSync("git", ["-C", repo, "add", "--", ...paths]);
    execFileSync("git", ["-C", repo, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "-c", "user.name=Offline test", "-c", "user.email=offline@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "Temporary root automation test fixture"]);
    return { repo, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(parent, { recursive: true, force: true });
    throw error;
  }
}
