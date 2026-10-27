import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveUpstreamRuntimeEntry } from "../scripts/lib/upstream-runtime.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("an explicit upstream runtime entry requires the published file, without source fallback", () => {
  const dir = mkdtempSync(join(tmpdir(), "amox-upstream-runtime-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/index.ts"), "export default () => {};\n");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ pi: { extensions: ["./src/index.ts"] } }));
    assert.throws(() => resolveUpstreamRuntimeEntry(dir, "dist/index.js"), /Required upstream runtime entry/);
    mkdirSync(join(dir, "dist/index.js"), { recursive: true });
    assert.throws(() => resolveUpstreamRuntimeEntry(dir, "dist/index.js"), /not a file/);
    writeFileSync(join(dir, "dist/runtime.js"), "export default () => {};\n");
    assert.equal(resolveUpstreamRuntimeEntry(dir, "dist/runtime.js"), join(dir, "dist/runtime.js"));
    for (const invalid of ["../src/index.ts", "/dist/index.js", "dist/../src/index.ts", "", undefined]) {
      assert.throws(() => resolveUpstreamRuntimeEntry(dir, invalid), /Unsafe relative path/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("subagents runtime policy is shared by its adapter, typecheck, contracts and production verification", () => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, "maintenance/manifest.json"), "utf8"));
  const entry = manifest.packages.find((item) => item.id === "pi-subagents-lean");
  assert.equal(entry.upstreamEntry, "dist/index.js");
  const specifier = `${entry.upstreamPackage}/${entry.upstreamEntry}`;
  const adapter = readFileSync(join(repoRoot, entry.path, entry.entry), "utf8");
  assert.ok(adapter.includes(`import subagents from "${specifier}";`));
  assert.ok(!adapter.includes(`${entry.upstreamPackage}/src/`), "production must not fall back to source");
  const config = JSON.parse(readFileSync(join(repoRoot, entry.path, "tsconfig.json"), "utf8"));
  assert.deepEqual(Object.keys(config.compilerOptions.paths), [specifier]);
  assert.ok(manifest.packages.filter((item) => item.id !== entry.id).every((item) => item.upstreamEntry === undefined),
    "web and todo keep their existing discovery policy");
});
