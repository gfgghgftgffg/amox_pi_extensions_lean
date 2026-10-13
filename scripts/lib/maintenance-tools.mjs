import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Type } from "typebox";
import { agentWritable, assertRegularPath, fileInventory, lfText, validateReview } from "./automation-policy.mjs";

function result(text) { return { content: [{ type: "text", text }], details: undefined }; }

// Deliberately no bash, exec, network, package manager, environment, or plugin
// tools. The model key stays in the SDK process; upstream text is only data.
export function createMaintenanceTools({ repoRoot, contextRoot, manifest, plan }) {
  const repoFiles = fileInventory(repoRoot).filter((path) => agentWritable(path, manifest)
    || ["package.json", "maintenance/manifest.json", "maintenance/tool-contracts.json", "docs/maintenance.md"].includes(path)
    || manifest.packages.some((entry) => path === `${entry.path}/package.json`));
  const originalTests = new Map(repoFiles.filter((path) => /\/tests\//.test(path)).map((path) => [path, readFileSync(join(repoRoot, path), "utf8")]));
  const reads = new Set();
  const contextFiles = fileInventory(contextRoot);
  let completed;
  const scopeFiles = { repo: repoFiles, upstream: contextFiles };
  const roots = { repo: repoRoot, upstream: contextRoot };
  const tools = [
    {
      name: "maintenance_list", label: "List review files", description: "List allowed repository or upstream text files. Filter by a literal substring.",
      parameters: Type.Object({ scope: Type.Union([Type.Literal("repo"), Type.Literal("upstream")]), filter: Type.Optional(Type.String()) }),
      execute: async (_id, { scope, filter = "" }) => result(scopeFiles[scope].filter((path) => path.includes(filter)).slice(0, 1000).join("\n")),
    },
    {
      name: "maintenance_read", label: "Read review file", description: "Read an allowed UTF-8 text file, optionally by line offset (1-indexed).",
      parameters: Type.Object({ scope: Type.Union([Type.Literal("repo"), Type.Literal("upstream")]), path: Type.String(), offset: Type.Optional(Type.Integer({ minimum: 1 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })) }),
      execute: async (_id, { scope, path, offset = 1, limit = 300 }) => {
        if (!scopeFiles[scope].includes(path)) throw new Error("File not in read allowlist");
        const text = readFileSync(assertRegularPath(roots[scope], path), "utf8");
        reads.add(`${scope}:${path}`);
        const lines = text.split("\n");
        return result(lines.slice(offset - 1, offset - 1 + limit).map((line, index) => `${offset + index}: ${line}`).join("\n").slice(0, 60_000) + `\n[${lines.length} total lines]`);
      },
    },
    {
      name: "maintenance_write", label: "Write adapter or documentation", description: "Write an entire allowed adapter, package test, README, MAINTENANCE.md or maintenance/agent-review.md. No config, dependencies, workflow, version or snapshot writes.",
      parameters: Type.Object({ path: Type.String(), content: Type.String({ maxLength: 500_000 }) }),
      execute: async (_id, { path, content }) => {
        if (completed) throw new Error("Review is already finished");
        if (!agentWritable(path, manifest)) throw new Error("Protected path");
        if (content.includes("\0")) throw new Error("Binary content forbidden");
        if (originalTests.has(path) && !lfText(content).startsWith(lfText(originalTests.get(path)))) throw new Error("Existing tests are append-only; add a regression test instead");
        const target = assertRegularPath(repoRoot, path, { allowMissing: true });
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
        if (!repoFiles.includes(path)) repoFiles.push(path);
        return result(`Wrote ${path}`);
      },
    },
    {
      name: "maintenance_edit", label: "Edit adapter or documentation", description: "Replace one unique exact substring in an allowed text file.",
      parameters: Type.Object({ path: Type.String(), oldText: Type.String({ minLength: 1 }), newText: Type.String({ maxLength: 500_000 }) }),
      execute: async (_id, { path, oldText, newText }) => {
        if (completed || !agentWritable(path, manifest)) throw new Error("Protected or finished review");
        const target = assertRegularPath(repoRoot, path);
        const text = readFileSync(target, "utf8");
        if (text.split(oldText).length !== 2 || newText.includes("\0")) throw new Error("Expected one exact text match");
        const updated = text.replace(oldText, newText);
        if (originalTests.has(path) && !lfText(updated).startsWith(lfText(originalTests.get(path)))) throw new Error("Existing tests are append-only; add a regression test instead");
        writeFileSync(target, updated);
        return result(`Edited ${path}`);
      },
    },
    {
      name: "maintenance_finish", label: "Finish review", description: "Report ready only after reviewing every changed package and making the minimal lean adaptations. Tests run independently afterward. Uncertainty must be ready:false. Write detailed evidence to maintenance/agent-review.md first.",
      parameters: Type.Object({ ready: Type.Boolean(), reviewedPackages: Type.Array(Type.String()), summary: Type.String({ maxLength: 20_000, description: "Public release changelog: actual upstream behavior/API changes, lean adaptations, regression fixes and limitations. No unexecuted test claims." }) }),
      execute: async (_id, review) => {
        if (completed) throw new Error("Already finished");
        if (!existsSync(join(repoRoot, "maintenance/agent-review.md"))) throw new Error("Write maintenance/agent-review.md first");
        if (review.ready) {
          for (const pkg of manifest.packages) {
            const engine = plan.packagePlans.find((item) => item.id === pkg.id);
            const lean = plan.leanPlans.find((item) => item.id === pkg.id);
            if (engine.versionChange !== "bump" && !lean.changed) continue;
            if (!reads.has(`repo:${pkg.path}/MAINTENANCE.md`)) throw new Error(`Read ${pkg.id} maintenance notes before finishing`);
            for (const family of [engine.versionChange === "bump" ? "upstream" : null, lean.changed ? "lean" : null].filter(Boolean)) {
              for (const revision of ["before", "after"]) {
                const prefix = `upstream:${pkg.id}/${family}-${revision}/`;
                if (![...reads].some((path) => path.startsWith(prefix) && /\.(ts|js|mjs)$/.test(path))) throw new Error(`Read ${pkg.id} ${family}-${revision} source before finishing`);
              }
            }
          }
        }
        // Preserve a blocked review as a deliberate failure, not silent success.
        completed = review;
        return { ...result(review.ready ? "Review finished; independent verification is still required." : "Review blocked; nothing will be published."), terminate: true };
      },
    },
  ];
  return { tools, finish() { validateReview(completed, plan); return completed; } };
}
