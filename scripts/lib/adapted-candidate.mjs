import { isDeepStrictEqual } from "node:util";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyCandidateFiles, validateCandidateArtifact } from "./candidate.mjs";
import { buildUpdatePlan } from "./upstream-plan.mjs";
import { defaultGitHeadResolver } from "./upstream-metadata.mjs";
import { AGENT_REPORT, applyFiles, HEX40, jsonText, lfText, nextPatch, readJson, sha256, validateFiles, validateReview } from "./automation-policy.mjs";

export const ADAPTED_KIND = "amox-lean-adapted-candidate";

export function buildAdaptedBundle({ baseCommit, dependencyCandidate, plan, review, files, status = "proposed" }) {
  return { schemaVersion: 1, kind: ADAPTED_KIND, baseCommit, dependencyCandidate, plan, review, status,
    files: files.map(({ path, content }) => ({ path, content, contentSha256: sha256(content) })).sort((a, b) => a.path.localeCompare(b.path)) };
}

export function expectedGenerated({ repoRoot, dependencyWrites, plan }) {
  const map = new Map(dependencyWrites.map((file) => [file.path, file.content]));
  const load = (path) => map.has(path) ? JSON.parse(map.get(path)) : readJson(join(repoRoot, path));
  const root = load("package.json");
  const version = nextPatch(root.version);
  root.version = version;
  map.set("package.json", jsonText(root));
  const manifest = load("maintenance/manifest.json");
  for (const entry of manifest.packages) {
    entry.version = version;
    const lean = plan.leanPlans.find((item) => item.id === entry.id);
    if (lean.changed) entry.leanCommit = lean.remoteHead;
    const path = `${entry.path}/package.json`;
    const pkg = load(path);
    pkg.version = version;
    map.set(path, jsonText(pkg));
  }
  map.set("maintenance/manifest.json", jsonText(manifest));
  const lock = load("package-lock.json");
  lock.version = version;
  lock.packages[""].version = version;
  for (const entry of manifest.packages) lock.packages[entry.path].version = version;
  map.set("package-lock.json", jsonText(lock));
  return { map, manifest, version };
}

function validateSnapshot(snapshot, manifest, repoRoot) {
  const baseline = readJson(join(repoRoot, "maintenance/tool-contracts.json"));
  if (snapshot.schemaVersion !== baseline.schemaVersion || snapshot.estimator !== baseline.estimator) throw new Error("Invalid snapshot format");
  for (const family of ["lean", "upstream"]) {
    if (!isDeepStrictEqual(Object.keys(snapshot[family]).sort(), Object.keys(baseline[family]).sort())) throw new Error("Snapshot changed package identities");
    for (const [name, record] of Object.entries(snapshot[family])) {
      const entry = manifest.packages.find((item) => (family === "lean" ? item.packageName : item.upstreamPackage) === name);
      const previous = baseline[family][name];
      if (record.package !== name || record.entry !== previous.entry || record.version !== (family === "lean" ? entry.version : entry.upstreamVersion)) throw new Error("Snapshot identity/version mismatch");
      if (!Array.isArray(record.tools) || !isDeepStrictEqual(record.registeredTools, record.tools.map((tool) => tool.name))) throw new Error("Invalid registered tool inventory");
      if (family === "lean" && (!isDeepStrictEqual(record.registeredTools, previous.registeredTools) || record.upstreamPackage !== entry.upstreamPackage)) throw new Error("Lean facade identity changed");
      let registered = 0, active = 0;
      for (const tool of record.tools) {
        if (typeof tool.description !== "string" || typeof tool.promptSnippet !== "string" || !Array.isArray(tool.promptGuidelines) || tool.promptGuidelines.some((item) => typeof item !== "string") || typeof tool.active !== "boolean") throw new Error("Invalid tool contract");
        const chars = { description: tool.description.length, schema: JSON.stringify(tool.parameters).length, snippet: tool.promptSnippet.length, guidelines: tool.promptGuidelines.reduce((sum, item) => sum + item.length, 0) };
        chars.total = Object.values(chars).reduce((sum, count) => sum + count, 0);
        if (!isDeepStrictEqual(tool.chars, chars) || tool.proxyTokens !== Math.ceil(chars.total / 4)) throw new Error("Invalid tool character accounting");
        registered += tool.proxyTokens;
        if (tool.active) active += tool.proxyTokens;
      }
      if (record.totals.registeredProxyTokens !== registered || record.totals.activeProxyTokens !== active) throw new Error("Invalid snapshot totals");
    }
  }
}

export async function validateAdaptedBundle({ bundle, repoRoot, headSha, resolveRegistryMetadata, gitHeadResolver = defaultGitHeadResolver, verified = false }) {
  if (!bundle || Object.keys(bundle).sort().join(",") !== "baseCommit,dependencyCandidate,files,kind,plan,review,schemaVersion,status") throw new Error("Unexpected adapted bundle fields");
  if (bundle.schemaVersion !== 1 || bundle.kind !== ADAPTED_KIND || !HEX40.test(bundle.baseCommit) || bundle.baseCommit !== headSha) throw new Error("Wrong or stale adapted candidate baseline");
  if (bundle.status !== (verified ? "verified" : "proposed")) throw new Error("Candidate is not in the required verification state");
  const baseline = readJson(join(repoRoot, "maintenance/manifest.json"));
  const workspaces = baseline.packages.map((entry) => ({ id: entry.id, path: entry.path, packageJsonPath: `${entry.path}/package.json`, pkg: readJson(join(repoRoot, entry.path, "package.json")) }));
  const plan = buildUpdatePlan({ manifest: baseline, workspaces, metadata: bundle.plan?.metadata });
  if (plan.status === "error" || plan.status === "no-update" || !isDeepStrictEqual(plan, bundle.plan)) throw new Error("Invalid maintenance plan");
  validateReview(bundle.review, plan);
  const dependency = await validateCandidateArtifact({ artifact: bundle.dependencyCandidate, repoRoot, headSha, resolveRegistryMetadata });
  if (!dependency.ok) throw new Error(`Dependency candidate rejected:\n${dependency.errors.join("\n")}`);
  if (bundle.dependencyCandidate.baseCommit !== bundle.baseCommit) throw new Error("Dependency baseCommit mismatch");
  if (plan.updateRequired && !dependency.writes.some((file) => file.path === "package-lock.json")) throw new Error("Incomplete dependency candidate: installation must succeed before adaptation");
  const writes = new Map(dependency.writes.map((file) => [file.path, file.content]));
  // Tie the agent plan to the independently validated dependency target.
  const targetManifest = writes.has("maintenance/manifest.json") ? JSON.parse(writes.get("maintenance/manifest.json")) : baseline;
  for (const entry of baseline.packages) {
    const target = targetManifest.packages.find((item) => item.id === entry.id);
    const pkgPlan = plan.packagePlans.find((item) => item.id === entry.id);
    if (target.upstreamVersion !== pkgPlan.latestVersion || target.upstreamGitHead !== pkgPlan.upstreamGitHead) throw new Error("Agent plan diverges from dependency candidate");
    const lean = plan.leanPlans.find((item) => item.id === entry.id);
    if (lean.changed && gitHeadResolver(entry.leanRepository) !== lean.remoteHead) throw new Error("Lean source HEAD changed since review; rerun rather than accepting stale evidence");
  }
  validateFiles(bundle.files, repoRoot, baseline, { generated: verified });
  const contents = new Map(bundle.files.map((file) => [file.path, file.content]));
  if (!contents.has(AGENT_REPORT) || contents.get(AGENT_REPORT).trim().length < 100) throw new Error("Missing detailed agent evidence");
  for (const entry of baseline.packages) {
    const source = `${entry.path}/${entry.entry}`;
    if (contents.has(source) && lfText(contents.get(source)) !== lfText(readFileSync(join(repoRoot, source), "utf8"))
      && !bundle.files.some((file) => file.path.startsWith(`${entry.path}/tests/`)
        && (!readableExisting(repoRoot, file.path) || lfText(file.content) !== lfText(readableExisting(repoRoot, file.path))))) {
      throw new Error(`Adapter change needs a regression test: ${entry.id}`);
    }
  }
  if (!verified) return { dependencyWrites: dependency.writes, files: bundle.files, plan, baseline };
  const expected = expectedGenerated({ repoRoot, dependencyWrites: dependency.writes, plan });
  for (const path of ["package.json", "package-lock.json", "maintenance/manifest.json", ...baseline.packages.map((entry) => `${entry.path}/package.json`)]) {
    if (!contents.has(path) || !isDeepStrictEqual(JSON.parse(contents.get(path)), JSON.parse(expected.map.get(path)))) throw new Error(`Unauthorized generated metadata change: ${path}`);
  }
  if (!contents.has("maintenance/tool-contracts.json")) throw new Error("Missing newly measured contracts");
  validateSnapshot(JSON.parse(contents.get("maintenance/tool-contracts.json")), expected.manifest, repoRoot);
  if (!contents.get("maintenance/update-report.md")?.includes("<!-- amox-maintenance-adapted; verified -->")) throw new Error("Missing verified update report");
  return { dependencyWrites: dependency.writes, files: bundle.files, plan, baseline, version: expected.version };
}

function readableExisting(root, path) {
  try { return readFileSync(join(root, path), "utf8"); } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

export function applyAdaptedBundle(repoRoot, validated, { verified = false } = {}) {
  if (!verified) applyCandidateFiles({ repoRoot, writes: validated.dependencyWrites });
  applyFiles(repoRoot, validated.files);
}
