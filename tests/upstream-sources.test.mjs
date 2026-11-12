import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectSources } from "../scripts/lib/upstream-sources.mjs";
import { fetchPublishedSource } from "../scripts/lib/fork-review.mjs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { RemoteHttpError } from "../scripts/lib/remote-errors.mjs";

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

test("source collector records exact before/after revisions, related packages and changelog as text only", async () => {
  const f = sourceFixture();
  try {
    const records = await collectSources(f);
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

test("source collector refuses invalid repository identities and mismatched commits", async () => {
  const f = sourceFixture();
  try {
    f.entry.upstreamRepository = "file:///private";
    await assert.rejects(collectSources(f), /Invalid source identity/);
    f.entry.upstreamRepository = "https://github.com/example/engine.git";
    await assert.rejects(collectSources({ ...f, runGit: (args, options) => args[0] === "rev-parse" ? "d".repeat(40) : f.runGit(args, options) }), /revision mismatch/);
  } finally { f.cleanup(); }
});

function publishedFixture(version) {
  const blocks = [];
  for (const [path, content] of [["package.json", JSON.stringify({ name: "pi-goal-x", version, scripts: { postinstall: "never execute" } })],
    ["extensions/goal.ts", `// ${version}\nthrow new Error('source must never execute');\n`]]) {
    const body = Buffer.from(content), header = Buffer.alloc(512);
    header.write(`package/${path}`); header.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
    header.fill(32, 148, 156); header[156] = 48; header.write("ustar\0", 257);
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0") + "\0 ", 148);
    blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  const archive = gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
  return { archive, integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}` };
}

function npmSourceFixture(t) {
  const outDir = mkdtempSync(join(tmpdir(), "amox-npm-source-test-"));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  const entry = { id: "pi-goal-x-lean", maintenanceMode: "original-facade", upstreamPackage: "pi-goal-x", upstreamSource: "npm",
    upstreamVersion: "0.34.1", upstreamRef: "npm:pi-goal-x@0.34.1" };
  const requested = [], materials = new Map(["0.34.1", "0.35.0"].map(version => [version, publishedFixture(version)]));
  const source = (name, version) => fetchPublishedSource(name, version, { fetchImpl: async (url, options) => {
    requested.push(url); assert.equal(options.redirect, "error");
    const material = materials.get(version), tarball = `https://registry.npmjs.org/pi-goal-x/-/pi-goal-x-${version}.tgz`;
    assert.ok([`https://registry.npmjs.org/pi-goal-x/${version}`, tarball].includes(url));
    return new Response(url === tarball ? material.archive : JSON.stringify({ name, version, dist: { tarball, integrity: material.integrity } }));
  } });
  return { outDir, manifest: { packages: [entry] }, requested, materials, source,
    plan: { packagePlans: [{ id: entry.id, versionChange: "bump", latestVersion: "0.35.0", upstreamRef: "npm:pi-goal-x@0.35.0" }], leanPlans: [] },
    runGit() { throw new Error("npm provenance must never fall back to Git"); } };
}

test("npm source collection reuses exact publication verification for both revisions and records integrity, without Git or hooks", async t => {
  const f = npmSourceFixture(t), records = await collectSources(f);
  assert.deepEqual(records, ["0.34.1", "0.35.0"].map((version, i) => ({ source: "npm", ref: `npm:pi-goal-x@${version}`,
    integrity: f.materials.get(version).integrity, path: `pi-goal-x-lean/upstream-${i ? "after" : "before"}` })));
  assert.equal(f.requested.length, 4);
  assert.deepEqual(JSON.parse(readFileSync(join(f.outDir, "context/sources.json"), "utf8")), records);
  for (const stage of ["before", "after"]) {
    assert.match(readFileSync(join(f.outDir, `context/pi-goal-x-lean/upstream-${stage}/extensions/goal.ts`), "utf8"), /source must never execute/);
  }
  assert.equal(existsSync(join(f.outDir, "context/pi-goal-x-lean/lean-before")), false);
});

test("npm source failures stay fail-closed: invalid refs, corrupt archives and HTTP errors never use Git", async t => {
  const f = npmSourceFixture(t), entry = f.manifest.packages[0];
  entry.upstreamRef = "npm:pi-goal-x@latest";
  await assert.rejects(collectSources(f), /Invalid published source identity/); assert.deepEqual(f.requested, []);
  entry.upstreamRef = "npm:pi-goal-x@0.34.1";
  f.materials.get("0.34.1").integrity = `sha512-${"A".repeat(86)}==`;
  await assert.rejects(collectSources(f), /integrity mismatch/);
  assert.equal(existsSync(join(f.outDir, "context/sources.json")), false);
  const error = new RemoteHttpError("fixture", { httpStatus: 503, phase: "upstream-read" });
  await assert.rejects(collectSources({ ...f, source: async () => { throw error; } }), e => e === error);
  delete entry.upstreamSource;
  await assert.rejects(collectSources(f), /Invalid source identity/);
});
