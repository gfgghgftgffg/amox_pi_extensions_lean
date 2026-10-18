import assert from "node:assert/strict";
import test, { after } from "node:test";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "lean-web-042-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.env.PI_WEB_ACCESS_CACHE_ROOT = join(root, "cache");
process.env.METADATA_SERVER_DETECTION = "none";
for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) delete process.env[key];
writeFileSync(join(root, "web-search.json"), JSON.stringify({
  workflow: "none", toolExposure: "deferred", deepseekApiKey: "offline-fixture",
  fetchRouting: { providers: ["http"], allowRemoteHostedProviders: false },
}));
// Install offline transport before importing any upstream module.
const originalLookup = dns.lookup;
const originalFetch = globalThis.fetch;
dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
syncBuiltinESMExports();
const requests = [];
const page = "Offline page body for the virtual-model answer.";
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  requests.push({ url: url.href, body: init?.body });
  if (url.href === "https://api.deepseek.com/v1/tools/search") {
    return Response.json({ results: [{ title: "Offline source", url: "https://source.example/result", summary: "Offline snippet" }] });
  }
  assert.equal(url.href, "https://source.example/page");
  return new Response(page, { headers: { "content-type": "text/plain" } });
};
after(() => {
  dns.lookup = originalLookup;
  syncBuiltinESMExports();
  globalThis.fetch = originalFetch;
  rmSync(root, { recursive: true, force: true });
});
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { default: extension } = await jiti.import("../index.ts");
function boot() {
  const tools = [];
  const handlers = new Map();
  const activeChanges = [];
  const noop = () => undefined;
  extension(new Proxy({
    registerTool: tool => tools.push(tool),
    on(event, handler) {
      const entries = handlers.get(event) ?? [];
      entries.push(handler);
      handlers.set(event, entries);
      return noop;
    },
    events: { on: noop, emit: noop },
    getActiveTools: () => ["web_access"], getAllTools: () => tools,
    setActiveTools: names => activeChanges.push(names),
  }, { get: (target, key) => key in target ? target[key] : noop }));
  assert.deepEqual(tools.map(t => t.name), ["web_access"]);
  assert.deepEqual(Object.keys(tools[0].parameters.properties), ["op", "input"]);
  assert.notEqual(tools[0].exposure, "deferred");
  return { tool: tools[0], handlers, activeChanges };
}
const rendered = result => result.content.filter(c => c.type === "text").map(c => c.text).join("\n");

test("0.42 DeepSeek is available through help and JSON search under deferred upstream exposure", async () => {
  const { tool, handlers, activeChanges } = boot();
  for (const handler of handlers.get("before_agent_start") ?? []) await handler({}, {});
  assert.deepEqual(activeChanges, []);
  for (const op of ["search", "check"]) {
    const help = await tool.execute(`help-${op}`, { op: "help", input: op });
    assert.match(rendered(help), /deepseek/);
  }
  requests.length = 0;
  const result = await tool.execute("deepseek", { op: "search", input: JSON.stringify({
    query: "offline", provider: '["deepseek"]', domainFilter: '["source.example","-excluded.example"]', workflow: "none", numResults: 2,
  }) });
  assert.notEqual(result.isError, true);
  assert.match(rendered(result), /Offline source/);
  assert.equal(result.structuredContent.queries[0].error, null);
  assert.deepEqual(result.structuredContent.queries[0].results, [{ title: "Offline source", url: "https://source.example/result", snippet: "Offline snippet" }]);
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].body), { query: "offline site:source.example -site:excluded.example", count: 2 });
  requests.length = 0;
  const invalid = await tool.execute("deepseek-long", { op: "search", input: JSON.stringify({ query: "x".repeat(129), provider: "deepseek", workflow: "none" }) });
  assert.equal(invalid.isError, true);
  assert.match(invalid.structuredContent.queries[0].error, /at most 128/);
  assert.match(rendered(invalid), /128/);
  assert.deepEqual(requests, []);
});

test("0.42 facade answer mode forwards the host registry streaming path and preserves response layers", async () => {
  const { tool } = boot();
  const calls = [];
  const model = { provider: "offline-router", id: "virtual", api: "virtual", input: ["text"], contextWindow: 80000 };
  const ctx = {
    model, scopedModels: [], sessionManager: { getSessionId: () => "offline-session" },
    modelRegistry: {
      getApiKeyAndHeaders: async () => ({ ok: true }),
      complete: () => { throw new Error("virtual model must use registry streamSimple"); },
      streamSimple(...args) {
        calls.push(args);
        return { result: async () => ({ stopReason: "stop", content: [{ type: "text", text: "Offline answer" }] }) };
      },
    },
  };
  requests.length = 0;
  const result = await tool.execute("virtual-answer", { op: "fetch", input: JSON.stringify({ url: "https://source.example/page", mode: "answer", prompt: "What does the page say?" }) }, undefined, undefined, ctx);
  assert.notEqual(result.isError, true);
  assert.match(rendered(result), /Offline answer/);
  assert.equal(result.structuredContent.urls[0].error, null);
  assert.equal(result.structuredContent.urls[0].content, "Offline answer");
  assert.equal(result.content[0].text, "Offline answer");
  assert.match(rendered(result), /Original source content is stored/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], model);
  assert.match(JSON.stringify(calls[0][1]), /Offline page body/);
  assert.equal(calls[0][2].sessionId, "offline-session");
  assert.equal(calls[0][2].cacheRetention, "none");
  assert.equal(requests.length, 1);
});
