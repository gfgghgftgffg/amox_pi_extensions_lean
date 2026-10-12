import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectSources } from "../scripts/lib/upstream-sources.mjs";

function sourceFixture() {
  const outDir = mkdtempSync(join(tmpdir(), "amox-source-context-test-"));
  const entry = { id: "example", upstreamRepository: "https://github.com/example/engine.git", upstreamGitHead: "a".repeat(40), upstreamRepositoryDirectory: "packages/engine", upstreamRelatedDirectories: ["packages/translations"], leanRepository: "https://github.com/example/lean.git", leanCommit: "c".repeat(40) };
  const plan = { packagePlans: [{ id: entry.id, versionChange: "bump", upstreamGitHead: "b".repeat(40) }], leanPlans: [{ id: entry.id, changed: false }] };
  const revisions = new Map();
  const runGit = (args, { cwd }) => {
    if (args.includes("fetch")) {
      const revision = args.at(-1);
      revisions.set(cwd, revision);
      mkdirSync(join(cwd, "packages/engine"), { recursive: true });
      mkdirSync(join(cwd, "packages/translations"), { recursive: true });
      writeFileSync(join(cwd, "packages/engine/index.ts"), `// ${revision}\nthrow new Error('source must never execute');\n`);
      writeFileSync(join(cwd, "packages/engine/binary.bin"), Buffer.from([0, 1, 2]));
      writeFileSync(join(cwd, "packages/translations/index.ts"), "export const translate = () => 'text';\n");
      writeFileSync(join(cwd, "CHANGELOG.md"), "# Public source changelog\n");
    }
    return args[0] === "rev-parse" ? revisions.get(cwd) : "";
  };
  return { outDir, entry, plan, manifest: { packages: [entry] }, runGit, cleanup: () => rmSync(outDir, { recursive: true, force: true }) };
}

test("source collector records exact before/after revisions, related packages and changelog as text only", () => {
  const f = sourceFixture();
  try {
    const records = collectSources(f);
    assert.equal(records.length, 2);
    assert.deepEqual(records.map((record) => record.revision), ["a".repeat(40), "b".repeat(40)]);
    for (const stage of ["before", "after"]) {
      const dir = join(f.outDir, "context/example", `upstream-${stage}`);
      assert.ok(readFileSync(join(dir, "index.ts"), "utf8").includes("source must never execute"));
      assert.ok(existsSync(join(dir, "RELATED-translations/index.ts")));
      assert.ok(existsSync(join(dir, "ROOT-CHANGELOG.md")));
      assert.equal(existsSync(join(dir, "binary.bin")), false);
    }
  } finally { f.cleanup(); }
});

test("source collector refuses invalid repository identities and mismatched commits", () => {
  const f = sourceFixture();
  try {
    f.entry.upstreamRepository = "file:///private";
    assert.throws(() => collectSources(f), /Invalid source identity/);
    f.entry.upstreamRepository = "https://github.com/example/engine.git";
    assert.throws(() => collectSources({ ...f, runGit: (args, options) => args[0] === "rev-parse" ? "d".repeat(40) : f.runGit(args, options) }), /revision mismatch/);
  } finally { f.cleanup(); }
});
