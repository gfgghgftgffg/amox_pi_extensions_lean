import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Current root automation in a TEMP-only clean commit, never the owned tree. */
export function cleanGitFixture(repoRoot) {
  const parent = mkdtempSync(join(tmpdir(), "amox-clean-git-fixture-"));
  const repo = join(parent, "repo");
  try {
    execFileSync("git", ["clone", "--quiet", "--no-hardlinks", "--", repoRoot, repo]);
    for (const path of ["scripts", "tests", "docs", ".github", "README.md"]) cpSync(join(repoRoot, path), join(repo, path), { recursive: true });
    execFileSync("git", ["-C", repo, "add", "--", "scripts", "tests", "docs", ".github", "README.md"]);
    execFileSync("git", ["-C", repo, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "-c", "user.name=Offline test", "-c", "user.email=offline@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "Temporary root automation test fixture"]);
    return { repo, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(parent, { recursive: true, force: true });
    throw error;
  }
}
