import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { measureDocs } from "../scripts/lib/local-checks.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "maintenance/manifest.json"), "utf8"));
const files = ["README.md", "README.zh-CN.md", ...manifest.packages.flatMap(entry =>
  ["README.md", "README.zh-CN.md"].map(file => `${entry.path}/${file}`))];

test("READMEs describe usage without release versions or test-environment snapshots", () => {
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(text, /^## (?:Versions|版本)\s*$|\| Version \||\* (?:Wrapper:|包装层：|Upstream runtime:|上游运行时：|Pi host tested:|Development test baseline:|开发测试基线：)/m, file);
  }
});

test("daily measurements refresh both languages without adding version metadata", () => {
  const repo = mkdtempSync(join(tmpdir(), "amox-readme-"));
  try {
    for (const file of [...files, "maintenance/tool-contracts.json"]) {
      mkdirSync(dirname(join(repo, file)), { recursive: true });
      writeFileSync(join(repo, file), readFileSync(join(root, file)));
    }
    const next = structuredClone(manifest);
    for (const entry of next.packages) {
      entry.version = "98.76.54";
      entry.upstreamVersion = "87.65.43";
    }
    measureDocs(repo, next);
    for (const file of files) assert.equal(readFileSync(join(repo, file), "utf8"), readFileSync(join(root, file), "utf8"), file);
    const snapshot = JSON.parse(readFileSync(join(repo, "maintenance/tool-contracts.json"), "utf8"));
    const entry = next.packages[0];
    snapshot.lean[entry.packageName].totals.registeredProxyTokens += 1;
    writeFileSync(join(repo, "maintenance/tool-contracts.json"), JSON.stringify(snapshot));
    measureDocs(repo, next);
    for (const file of ["README.md", "README.zh-CN.md"]) {
      assert.ok(readFileSync(join(repo, entry.path, file), "utf8").includes(
        `| ${entry.packageName} | ${snapshot.lean[entry.packageName].totals.registeredProxyTokens} |`));
    }
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
