import assert from "node:assert/strict";
import test, { after } from "node:test";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "lean-web-048-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.env.PI_WEB_ACCESS_CACHE_ROOT = join(root, "cache");
process.env.METADATA_SERVER_DETECTION = "none";
for (const key of Object.keys(process.env)) {
  if (/_BASE_URL$/.test(key) || /^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)$/i.test(key)) delete process.env[key];
}
writeFileSync(join(root, "web-search.json"), JSON.stringify({
  workflow: "none", automApiKey: "offline-key", cloroApiKey: "offline-key", specstreamApiKey: "offline-key",
  searchRouting: { providers: ["autom", "specstream"], fallbackOn: ["network"] },
  fetchRouting: { providers: ["http", "specstream"], allowRemoteHostedProviders: true },
}));
const originalLookup = dns.lookup, originalFetch = globalThis.fetch;
dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
syncBuiltinESMExports();
const requests = [];
const body = "# Hosted page\n\nOffline SpecStream page body.";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  requests.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, headers: new Headers(init.headers) });
  const source = { title: "Allowed source", url: "https://source.example/page", snippet: "Offline snippet" };
  const other = { title: "Excluded", url: "https://other.example/page", snippet: "Excluded snippet" };
  if (url.origin === "https://api.autom.dev" && url.pathname === "/v1/google/search") {
    if (url.searchParams.get("query") === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    return Response.json({ organic_results: [source, other].map(({ url, ...hit }) => ({ ...hit, link: url })) });
  }
  if (url.href === "https://api.cloro.dev/v1/monitor/google") return Response.json({ result: { organicResults: [source, other].map(({ url, ...hit }) => ({ ...hit, link: url })) } });
  if (url.origin === "https://api.specstream.ai" && url.pathname === "/v1/web-search") return Response.json({ data: { sources: [source, other] }, error: null });
  if (url.href === "https://api.specstream.ai/v1/extract") {
    assert.deepEqual(JSON.parse(init.body).urls, ["https://source.example/blocked"]);
    return Response.json({ data: { results: [{ status: "ok", title: "Hosted page", text: body }] } });
  }
  if (url.href === "https://source.example/blocked") return new Response("Forbidden", { status: 403 });
  if (url.href === "https://source.example/pixel.png") return new Response(Buffer.from(png, "base64"), { headers: { "content-type": "image/png" } });
  throw new Error(`Unexpected offline target: ${url.href}`);
};
after(() => { dns.lookup = originalLookup; syncBuiltinESMExports(); globalThis.fetch = originalFetch; rmSync(root, { recursive: true, force: true }); });
const jiti = createJiti(import.meta.url, { moduleCache: true });
const { default: extension } = await jiti.import("../index.ts");
function boot() {
  const tools = [], noop = () => undefined;
  extension(new Proxy({ registerTool: tool => tools.push(tool), events: { on: noop, emit: noop }, getAllTools: () => tools, getActiveTools: () => ["web_access"] }, { get: (target, key) => key in target ? target[key] : noop }));
  assert.deepEqual(tools.map(t => t.name), ["web_access"]);
  assert.deepEqual(Object.keys(tools[0].parameters.properties), ["op", "input"]);
  return tools[0];
}
const text = result => result.content.filter(c => c.type === "text").map(c => c.text).join("\n");
const call = (tool, op, input, ctx) => tool.execute(`048-${op}`, { op, input: JSON.stringify(input) }, undefined, undefined, ctx);

test("new provider help and JSON delegation preserve filtered structured search results", async () => {
  const tool = boot();
  for (const op of ["search", "check"]) {
    const help = text(await tool.execute("help", { op: "help", input: op }));
    for (const provider of ["specstream", "autom", "cloro"]) assert.match(help, new RegExp(provider));
  }
  for (const provider of ["specstream", "autom", "cloro"]) {
    requests.length = 0;
    const result = await call(tool, "search", { query: "offline facts", provider, domainFilter: ["source.example"], recencyFilter: "week", numResults: 2 });
    assert.notEqual(result.isError, true);
    assert.deepEqual(result.structuredContent.queries[0].results, [{ title: "Allowed source", url: "https://source.example/page", snippet: "Offline snippet" }]);
    assert.equal(result.structuredContent.queries[0].error, null);
    assert.match(text(result), /Allowed source/);
    assert.equal(requests.length, 1);
    const request = requests[0];
    if (provider === "autom") {
      assert.equal(request.headers.get("x-api-key"), "offline-key");
      assert.equal(request.url.searchParams.get("query"), "offline facts site:source.example");
      assert.equal(request.url.searchParams.get("tbs"), "qdr:w");
    } else {
      assert.equal(request.headers.get("authorization"), "Bearer offline-key");
      if (provider === "cloro") assert.deepEqual(request.body, { query: "offline facts site:source.example", country: "US" });
      else assert.equal(request.url.searchParams.get("q"), "offline facts");
    }
  }
});

test("provider timeout falls back through the facade's configured route", async () => {
  requests.length = 0;
  const result = await call(boot(), "search", { query: "timeout" });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.queries[0].provider, "specstream");
  assert.equal(result.structuredContent.queries[0].error, null);
  assert.deepEqual(requests.map(r => r.url.origin), ["https://api.autom.dev", "https://api.specstream.ai"]);
});

test("SpecStream hosted fetch retains body separately from rendered storage hints and get", async () => {
  requests.length = 0;
  const tool = boot();
  const result = await call(tool, "fetch", { url: "https://source.example/blocked" });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.urls[0].content, body);
  assert.equal(result.structuredContent.urls[0].error, null);
  assert.match(text(result), /Full content is stored/);
  assert.deepEqual(requests.map(r => r.url.href), ["https://source.example/blocked", "https://api.specstream.ai/v1/extract"]);
  assert.deepEqual(requests[1].body, { urls: ["https://source.example/blocked"], format: "markdown" });
  const stored = await call(tool, "get", { responseId: result.structuredContent.responseId, urlIndex: 0 });
  assert.notEqual(stored.isError, true);
  assert.match(text(stored), /Offline SpecStream page body/);
  assert.equal(stored.details.contentLength, body.length);
});

test("image answer delegates images to the host and returns text with original source retrieval", async () => {
  const tool = boot(), calls = [];
  const model = { provider: "offline", id: "vision", api: "virtual", input: ["text", "image"], contextWindow: 80000 };
  const ctx = { model, scopedModels: [], sessionManager: { getSessionId: () => "offline-session" }, modelRegistry: {
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "offline" }),
    streamSimple(selected, context, options) { calls.push({ selected, context, options }); return { result: async () => ({ stopReason: "stop", content: [{ type: "text", text: "A tiny pixel." }] }) }; },
  } };
  const result = await call(tool, "fetch", { url: "https://source.example/pixel.png", mode: "answer", prompt: "Describe it" }, ctx);
  assert.notEqual(result.isError, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].selected, model);
  assert.equal(calls[0].context.messages[0].content.filter(c => c.type === "image").length, 1);
  assert.equal(calls[0].options.cacheRetention, "none");
  assert.equal(result.structuredContent.urls[0].content, "A tiny pixel.");
  assert.equal(result.content.some(c => c.type === "image"), false);
  assert.match(text(result), /Original source content is stored/);
  const stored = await call(tool, "get", { responseId: result.structuredContent.responseId, urlIndex: 0 });
  assert.match(text(stored), /Image fetched/);
  assert.doesNotMatch(text(stored), /A tiny pixel/);
  const unsupported = await call(tool, "fetch", { url: "https://source.example/pixel.png", mode: "answer", prompt: "Describe it" }, { ...ctx, model: { ...model, input: ["text"] } });
  assert.equal(unsupported.isError, true);
  assert.match(unsupported.structuredContent.urls[0].error, /does not support image input/);
  assert.equal(calls.length, 1);
});
