import assert from "node:assert/strict";
import test, { after } from "node:test";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "lean-web-044-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.env.PI_WEB_ACCESS_CACHE_ROOT = join(root, "cache");
process.env.METADATA_SERVER_DETECTION = "none";
for (const key of Object.keys(process.env)) {
  if (/_BASE_URL$/.test(key) || /^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)$/i.test(key)) delete process.env[key];
}
const config = {
  workflow: "none", toolActivation: "none", toolExposure: "deferred",
  deepseekApiKey: "offline-deepseek", deepseekBaseUrl: "https://config.example/prefix",
  serpapiApiKey: "offline-serpapi", serpapiBaseUrl: "https://gateway.example/serpapi",
  jinaApiKey: "offline-jina", jinaSearchBaseUrl: "https://gateway.example/jina",
};
const save = value => writeFileSync(join(root, "web-search.json"), JSON.stringify(value));
save(config);
const originalLookup = dns.lookup;
const originalFetch = globalThis.fetch;
dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
syncBuiltinESMExports();
let transport;
const requests = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const request = { url, headers: new Headers(init?.headers), method: init?.method ?? "GET", body: init?.body, redirect: init?.redirect };
  requests.push(request);
  return transport(request);
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
  const tools = [], activeChanges = [];
  const noop = () => undefined;
  extension(new Proxy({
    registerTool: tool => tools.push(tool), on: () => noop,
    events: { on: noop, emit: noop }, getAllTools: () => tools,
    getActiveTools: () => ["web_access"], setActiveTools: names => activeChanges.push(names),
  }, { get: (target, key) => key in target ? target[key] : noop }));
  assert.deepEqual(tools.map(tool => tool.name), ["web_access"]);
  assert.deepEqual(Object.keys(tools[0].parameters.properties), ["op", "input"]);
  assert.equal(tools[0].exposure, undefined);
  assert.deepEqual(activeChanges, []);
  return tools[0];
}
const rendered = result => result.content.filter(c => c.type === "text").map(c => c.text).join("\n");
const call = (tool, op, input) => tool.execute(`044-${op}`, { op, input: JSON.stringify(input) });

test("0.44 none/deferred keeps one direct facade and rejects none/direct", async () => {
  const tool = boot();
  for (const op of ["search", "check", "fetch", "get"]) {
    assert.match(rendered(await tool.execute("help", { op: "help", input: op })), /Advanced input must be a JSON object string/);
  }
  save({ ...config, toolExposure: "direct" });
  try { assert.throws(boot, /requires toolExposure "deferred"/); }
  finally { save(config); }
});

test("0.44 DeepSeek gateway keeps prefixes, environment wins, and cross-origin redirects drop authorization", async () => {
  const tool = boot();
  process.env.PI_DEEPSEEK_BASE_URL = "https://env.example/proxy///";
  requests.length = 0;
  transport = request => {
    assert.equal(request.redirect, "manual");
    if (requests.length === 1) {
      assert.equal(request.url.href, "https://env.example/proxy/v1/tools/search");
      assert.equal(request.headers.get("authorization"), "Bearer offline-deepseek");
      return new Response(null, { status: 307, headers: { location: "https://redirect.example/search" } });
    }
    assert.equal(request.url.href, "https://redirect.example/search");
    assert.equal(request.headers.get("authorization"), null);
    return Response.json({ results: [{ title: "Gateway source", url: "https://source.example/page", summary: "Gateway snippet" }] });
  };
  try {
    const result = await call(tool, "search", { query: "gateway", provider: '["deepseek"]' });
    assert.notEqual(result.isError, true);
    assert.match(rendered(result), /Gateway source/);
    assert.equal(result.structuredContent.queries[0].error, null);
    assert.equal(result.structuredContent.queries[0].results[0].snippet, "Gateway snippet");
    assert.equal(requests.length, 2);
    assert.deepEqual(JSON.parse(requests[0].body), { query: "gateway", count: 5 });
    assert.equal(requests[1].body, requests[0].body);
    assert.equal(requests[1].method, "POST");
  } finally { delete process.env.PI_DEEPSEEK_BASE_URL; }
});

test("0.44 SerpApi gateway strips query credentials across origins through the facade", async () => {
  const tool = boot();
  requests.length = 0;
  transport = request => {
    assert.equal(request.redirect, "manual");
    if (requests.length === 1) {
      assert.equal(request.url.origin + request.url.pathname, "https://gateway.example/serpapi/search.json");
      assert.equal(request.url.searchParams.get("api_key"), "offline-serpapi");
      const target = new URL(request.url);
      target.hostname = "redirect.example";
      return new Response(null, { status: 307, headers: { location: target.href } });
    }
    assert.equal(request.url.hostname, "redirect.example");
    assert.deepEqual(request.url.searchParams.getAll("api_key"), []);
    assert.equal(request.url.searchParams.get("q"), "gateway");
    return Response.json({ organic_results: [{ title: "Serp source", link: "https://source.example/serp", snippet: "Serp snippet" }] });
  };
  const result = await call(tool, "search", { query: "gateway", provider: "serpapi" });
  assert.notEqual(result.isError, true);
  assert.match(rendered(result), /Serp source/);
  assert.equal(result.structuredContent.queries[0].results[0].url, "https://source.example/serp");
  assert.equal(requests.length, 2);
});

test("0.44 Jina dot queries fail without contacting the gateway", async () => {
  const tool = boot();
  requests.length = 0;
  transport = () => { throw new Error("Unexpected network request"); };
  for (const query of [".", ".."]) {
    const result = await call(tool, "search", { query, provider: "jina" });
    assert.equal(result.isError, true);
    assert.match(rendered(result), /dot path segment/);
    assert.match(result.structuredContent.queries[0].error, /dot path segment/);
  }
  assert.equal(requests.length, 0);
});
