import assert from "node:assert/strict";
import test, { after } from "node:test";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "lean-web-043-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.env.PI_WEB_ACCESS_CACHE_ROOT = join(root, "cache");
process.env.METADATA_SERVER_DETECTION = "none";
for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) delete process.env[key];
writeFileSync(join(root, "web-search.json"), JSON.stringify({
  workflow: "none", deepseekApiKey: "offline-deepseek", linkupApiKey: "offline-linkup",
  provider: ["deepseek"], searchRouting: { providers: ["deepseek", "linkup"], fallbackOn: ["network"] },
  fetchRouting: { providers: ["http", "deepseek"], allowRemoteHostedProviders: true },
}));
// Both transport mocks must precede the upstream imports, including lazy extract imports.
const originalLookup = dns.lookup;
const originalFetch = globalThis.fetch;
dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
syncBuiltinESMExports();
const requests = [];
const inlineBody = String.raw`Full source text keeps C:\docs\file and get_search_content({ responseId: "x", urlIndex: 0 }) literal.`;
const hostedBody = "# Hosted page\n\nMarkdown from DeepSeek Fetch.";
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const body = init?.body ? JSON.parse(init.body) : undefined;
  requests.push({ url: url.href, body, headers: init?.headers });
  if (url.href === "https://api.deepseek.com/v1/tools/search") {
    if (body.query === "fallback") throw new TypeError("offline network failure");
    return Response.json({ results: [{ title: "DeepSeek source", url: "https://source.example/result", summary: "Search snippet", content: inlineBody }] });
  }
  if (url.href === "https://api.linkup.so/v1/search") {
    return Response.json({ results: [{ type: "text", name: "Linkup source", url: "https://source.example/linkup", content: "Linkup inline body" }] });
  }
  if (url.href === "https://api.deepseek.com/v1/tools/fetch") {
    assert.equal(body.url, "https://source.example/hosted");
    return Response.json({ title: "Hosted page", content: hostedBody });
  }
  if (url.href === "https://source.example/hosted") return new Response("Forbidden", { status: 403 });
  assert.equal(url.href, "https://source.example/short");
  return new Response("<!doctype html><html><head><title>Short page</title></head><body><article><h1>Short page</h1><p>A complete short static page with useful offline content.</p></article></body></html>", { headers: { "content-type": "text/html" } });
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
  const noop = () => undefined;
  extension(new Proxy({
    registerTool: tool => tools.push(tool), on: noop,
    events: { on: noop, emit: noop }, getActiveTools: () => ["web_access"], getAllTools: () => tools,
  }, { get: (target, key) => key in target ? target[key] : noop }));
  assert.deepEqual(tools.map(t => t.name), ["web_access"]);
  assert.deepEqual(Object.keys(tools[0].parameters.properties), ["op", "input"]);
  return tools[0];
}
const rendered = result => result.content.filter(c => c.type === "text").map(c => c.text).join("\n");
const call = (tool, op, input) => tool.execute(`043-${op}`, { op, input: JSON.stringify(input) });

test("0.43 Linkup is disclosed by help and receives advanced JSON through upstream normalization", async () => {
  const tool = boot();
  for (const op of ["search", "check"]) assert.match(rendered(await tool.execute("help", { op: "help", input: op })), /linkup/);
  requests.length = 0;
  const result = await call(tool, "search", { query: "offline", provider: '["linkup"]', domainFilter: '["source.example"]', numResults: 2, includeContent: true });
  assert.notEqual(result.isError, true);
  assert.match(rendered(result), /Linkup source/);
  assert.equal(result.structuredContent.queries[0].error, null);
  assert.equal(result.structuredContent.queries[0].results[0].url, "https://source.example/linkup");
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body, { q: "offline", depth: "fast", outputType: "searchResults", maxResults: 2, includeDomains: ["source.example"] });
  const stored = await call(tool, "get", { responseId: result.structuredContent.fetchId });
  assert.equal(rendered(stored), "# Linkup source\n\nLinkup inline body");
});

test("0.43 DeepSeek includeContent stores provider page text without a second page fetch", async () => {
  const tool = boot();
  requests.length = 0;
  const result = await call(tool, "search", { query: "inline", provider: "deepseek", includeContent: true });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.queries[0].results[0].snippet, "Search snippet");
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body, { query: "inline", count: 5, need_content: true });
  assert.equal(typeof result.structuredContent.fetchId, "string");
  const stored = await call(tool, "get", { responseId: result.structuredContent.fetchId });
  assert.notEqual(stored.isError, true);
  // get returns a rendered title plus the stored body, not fetch structuredContent.
  assert.equal(rendered(stored), `# DeepSeek source\n\n${inlineBody}`);
  assert.equal(requests.length, 1);
});

test("0.43 configured provider arrays fall back but explicit per-call arrays remain strict", async () => {
  const tool = boot();
  requests.length = 0;
  const result = await call(tool, "search", { query: "fallback" });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.queries[0].provider, "linkup");
  assert.deepEqual(requests.map(r => r.url), ["https://api.deepseek.com/v1/tools/search", "https://api.linkup.so/v1/search"]);
  requests.length = 0;
  const strict = await call(tool, "search", { query: "fallback", provider: ["deepseek"] });
  assert.equal(strict.isError, true);
  assert.match(strict.structuredContent.queries[0].error, /offline network failure/);
  assert.equal(requests.length, 1);
});

test("0.43 readable fetch accepts a short static page and delegates opted-in DeepSeek fallback", async () => {
  const tool = boot();
  requests.length = 0;
  const short = await call(tool, "fetch", { url: "https://source.example/short" });
  assert.notEqual(short.isError, true);
  assert.equal(short.structuredContent.urls[0].error, null);
  assert.match(short.structuredContent.urls[0].content, /A complete short static page/);
  assert.match(rendered(short), /A complete short static page/);
  assert.deepEqual(requests.map(r => r.url), ["https://source.example/short"]);
  requests.length = 0;
  const hosted = await call(tool, "fetch", { url: "https://source.example/hosted" });
  assert.notEqual(hosted.isError, true);
  assert.equal(hosted.structuredContent.urls[0].error, null);
  assert.equal(hosted.structuredContent.urls[0].content, hostedBody);
  assert.match(rendered(hosted), /Markdown from DeepSeek Fetch/);
  assert.deepEqual(requests.map(r => r.url), ["https://source.example/hosted", "https://api.deepseek.com/v1/tools/fetch"]);
});
