/**
 * Reusable isolated Pi session harness.
 *
 * Loads Pi extension entrypoints through the real Pi host (`createAgentSession`
 * + `DefaultResourceLoader`) in a throwaway cwd/agent directory, so contract
 * capture and compatibility tests never touch the user's real `~/.pi` config,
 * sessions, or installed extensions.
 *
 * Maintenance tooling reuses:
 *   - `resolveHostModulePath()` to locate a Pi host for loading;
 *   - `createIsolatedEnvironment()` for scratch cwd/agent/home dirs;
 *   - `loadExtensionContracts()` to read one extension's registered tool
 *     contracts in isolation.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HOST_PACKAGE = "@earendil-works/pi-coding-agent";

/** Find a package entry by walking node_modules from `startDir` (exports-aware). */
function packageEntryFromNodeModules(packageName, startDir) {
  let dir = startDir;
  for (;;) {
    const packageJsonPath = join(dir, "node_modules", ...packageName.split("/"), "package.json");
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      const dot = pkg.exports?.["."];
      const exportEntry = typeof dot === "object" ? dot.import ?? dot.default ?? dot.require : dot;
      const entry = typeof exportEntry === "string" ? exportEntry : pkg.main ?? "index.js";
      return join(dirname(packageJsonPath), entry);
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Resolve a loadable `@earendil-works/pi-coding-agent` dist entry. */
export function resolveHostModulePath({ requireFrom = import.meta.url, env = process.env } = {}) {
  if (env.PI_CODING_AGENT_MODULE) return env.PI_CODING_AGENT_MODULE;
  const startDir = dirname(requireFrom.startsWith("file:") ? fileURLToPath(requireFrom) : resolve(String(requireFrom)));
  const localEntry = packageEntryFromNodeModules(HOST_PACKAGE, startDir);
  if (localEntry && existsSync(localEntry)) return localEntry;
  try {
    const require = createRequire(requireFrom);
    const resolved = require.resolve(HOST_PACKAGE);
    if (resolved) return resolved;
  } catch {
    // The package may only expose an `import` export condition; fall through.
  }
  {
    // Production Git installs omit dev/peer dependencies; fall back to the
    // managed Pi installation beside the user agent dir (read-only).
    const agentRoot = join(homedir(), ".pi", "agent");
    try {
      const raw = readFileSync(join(agentRoot, "install", "current-version"), "utf8").trim();
      const parsed = raw.startsWith("{") ? JSON.parse(raw) : undefined;
      const version = String(parsed?.version ?? parsed?.currentVersion ?? raw);
      if (version) {
        return join(agentRoot, "install", "releases", version, "node_modules", ...HOST_PACKAGE.split("/"), "dist", "index.js");
      }
    } catch {
      // fall through to the error below
    }
    throw new Error(
      "Cannot locate @earendil-works/pi-coding-agent. Install dev dependencies (npm ci) or set PI_CODING_AGENT_MODULE to a Pi host dist entry.",
    );
  }
}

/** Create isolated cwd/agent/home directories under a fresh temp root. */
export function createIsolatedEnvironment({ prefix = "amox-pi-isolated-" } = {}) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const cwd = join(root, "cwd");
  const agentDir = join(root, "agent");
  const sessionDir = join(root, "sessions");
  const home = join(root, "home");
  for (const dir of [cwd, agentDir, sessionDir, home]) mkdirSync(dir, { recursive: true });
  return {
    root,
    cwd,
    agentDir,
    sessionDir,
    home,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Environment variables that make a spawned process use an isolated env. */
export function isolatedEnvironmentVariables(env) {
  return {
    PI_CODING_AGENT_DIR: env.agentDir,
    PI_CODING_AGENT_SESSION_DIR: env.sessionDir,
    HOME: env.home,
  };
}

function guidelineList(tool) {
  if (Array.isArray(tool.promptGuidelines)) return tool.promptGuidelines;
  return tool.promptGuidelines ? [tool.promptGuidelines] : [];
}

function replaceAll(text, substitutions) {
  let result = text;
  for (const [from, to] of substitutions) result = result.split(from).join(to);
  return result;
}

function contractChars({ description, promptSnippet, promptGuidelines, parameters }) {
  const descriptionChars = description.length;
  const schemaChars = JSON.stringify(parameters ?? {}).length;
  const snippetChars = promptSnippet.length;
  const guidelineChars = promptGuidelines.reduce((sum, guideline) => sum + guideline.length, 0);
  return {
    description: descriptionChars,
    schema: schemaChars,
    snippet: snippetChars,
    guidelines: guidelineChars,
    total: descriptionChars + schemaChars + snippetChars + guidelineChars,
  };
}

/** Build the deterministic, host-independent contract for one tool. */
export function toolContract(tool, { active, substitutions = [] }) {
  let contract = {
    name: tool.name,
    active,
    source: tool.sourceInfo?.source ?? "extension",
    description: typeof tool.description === "string" ? tool.description : "",
    promptSnippet: typeof tool.promptSnippet === "string" ? tool.promptSnippet : "",
    promptGuidelines: guidelineList(tool),
    parameters: tool.parameters ?? {},
  };
  if (substitutions.length > 0) {
    // Upstream descriptions embed the agent dir / cwd (e.g. subagents lists
    // `<agentDir>/agents/*.md`); normalize them so snapshots stay portable and
    // reproducible across machines instead of leaking temp paths.
    contract = JSON.parse(replaceAll(JSON.stringify(contract), substitutions));
  }
  const chars = contractChars(contract);
  return {
    ...contract,
    chars,
    // Fixed character proxy: ceil(chars / 4). Not provider tokenization/billing.
    proxyTokens: Math.ceil(chars.total / 4),
  };
}

/**
 * Load one extension entrypoint in an isolated Pi session and return its
 * registered tool contracts plus load diagnostics.
 */
export async function loadExtensionContracts({
  extensionPath,
  hostModulePath,
  env,
  extraExtensionPaths = [],
  bind = true,
}) {
  const host = await import(pathToFileURL(resolve(hostModulePath)).href);
  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = host;
  if (typeof createAgentSession !== "function" || typeof DefaultResourceLoader !== "function") {
    throw new Error(`Pi host at ${hostModulePath} does not export the SDK surface needed for capture`);
  }
  const settingsManager = SettingsManager.create(env.cwd, env.agentDir);
  const loader = new DefaultResourceLoader({
    cwd: env.cwd,
    agentDir: env.agentDir,
    settingsManager,
    additionalExtensionPaths: [resolve(extensionPath), ...extraExtensionPaths.map((p) => resolve(p))],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  const loadErrors = (loaded.errors ?? []).map((error) => String(error));
  const { session, extensionsResult } = await createAgentSession({
    cwd: env.cwd,
    agentDir: env.agentDir,
    settingsManager,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    noTools: "builtin",
  });
  const runtimeErrors = [];
  const removeErrorListener = session._extensionRunner?.onError?.((error) => runtimeErrors.push(String(error)));
  try {
    if (bind) {
      await session.bindExtensions({ mode: "print" });
    }
    const active = new Set(session.getActiveToolNames());
    const substitutions = [
      [env.agentDir, "<agentDir>"],
      [env.cwd, "<cwd>"],
      [env.home, "<home>"],
    ];
    const tools = session
      .getAllTools()
      // Isolated sessions always carry Pi's built-in tools (read/bash/...);
      // contract capture only records tools registered by loaded extensions.
      .filter((tool) => tool.sourceInfo?.source !== "builtin")
      .map((tool) => toolContract(tool, { active: active.has(tool.name), substitutions }));
    const loadedPaths = (extensionsResult.extensions ?? []).map((extension) => extension.path ?? extension.name ?? "unknown");
    return {
      tools,
      activeToolNames: [...active],
      loadedPaths,
      loadErrors,
      runtimeErrors,
      piVersion: host.VERSION ?? "unknown",
    };
  } finally {
    removeErrorListener?.();
    session.dispose?.();
  }
}
