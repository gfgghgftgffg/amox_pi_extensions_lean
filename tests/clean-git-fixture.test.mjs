import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanGitFixture } from "./helpers/clean-git-fixture.mjs";

test("disposable Git fixture mirrors pruned files and newly added automation without touching the source", () => {
  const source = mkdtempSync(join(tmpdir(), "amox-fixture-mirror-test-"));
  let fixture;
  const git = (...args) => execFileSync("git", ["-C", source, ...args], { stdio: "pipe" });
  try {
    for (const dir of ["scripts", "tests", "docs", ".github", "maintenance", "packages"]) {
      mkdirSync(join(source, dir));
      writeFileSync(join(source, dir, "keep.txt"), "fixture\n");
    }
    for (const file of ["README.md", "package.json", "package-lock.json", ".gitignore", ".gitattributes", ".npmrc"]) writeFileSync(join(source, file), "fixture\n");
    writeFileSync(join(source, ".github/obsolete.yml"), "old workflow\n");
    writeFileSync(join(source, "scripts/unused.mjs"), "old script\n");
    git("init", "--quiet");
    git("add", "--all");
    git("-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "-c", "user.name=Offline test", "-c", "user.email=offline@example.invalid", "commit", "--quiet", "-m", "Fixture baseline");
    rmSync(join(source, ".github/obsolete.yml"));
    rmSync(join(source, "scripts/unused.mjs"));
    writeFileSync(join(source, "scripts/new-entry.mjs"), "new script\n");
    fixture = cleanGitFixture(source);
    assert.ok(!existsSync(join(fixture.repo, ".github/obsolete.yml")));
    assert.ok(!existsSync(join(fixture.repo, "scripts/unused.mjs")));
    assert.ok(existsSync(join(fixture.repo, "scripts/new-entry.mjs")));
    assert.equal(execFileSync("git", ["-C", fixture.repo, "status", "--porcelain"], { encoding: "utf8" }), "");
    assert.ok(!existsSync(join(source, "scripts/unused.mjs")));
    assert.ok(existsSync(join(source, "scripts/new-entry.mjs")));
  } finally {
    fixture?.cleanup();
    rmSync(source, { recursive: true, force: true });
  }
});
