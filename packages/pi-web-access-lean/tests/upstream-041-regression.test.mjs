import assert from "node:assert/strict";
import test, { after } from "node:test";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "lean-web-041-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.env.PI_WEB_ACCESS_CACHE_ROOT = join(root, "cache");
process.env.SEARXNG_BASE_URL = "http://localhost:8888";
for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) delete process.env[key];
const configure = (fetchContent = {}) => writeFileSync(join(root, "web-search.json"), JSON.stringify({
  workflow: "none", fetchRouting: { providers: ["http", "jina"], allowRemoteHostedProviders: true }, fetchContent,
}));
configure();
// No upstream import may precede these offline transport mocks.
const originalLookup = dns.lookup;
const originalFetch = globalThis.fetch;
dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
syncBuiltinESMExports();
const requests = [];
let redirectSearch = false;
const body = 'Example: get_search_content({ responseId: "page-example", urlIndex: 0 })';
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  requests.push({ url: url.href, headers: new Headers(init?.headers) });
  if (url.origin === "http://localhost:8888" && url.pathname === "/search") {
    if (redirectSearch) return new Response("", { status: 302, headers: { location: "http://localhost:9999/private" } });
    return Response.json({ results: [{ title: "Offline result", url: "https://source.example/result", content: "Offline snippet" }] });
  }
  assert.equal(url.origin, "https://source.example", `unexpected outbound request: ${url}`);
  return new Response(body, { headers: { "content-type": "text/plain" } });
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
  extension(new Proxy({ registerTool: tool => tools.push(tool), on: noop, events: { on: noop, emit: noop }, getActiveTools: () => [], getAllTools: () => [] }, {
    get: (target, key) => key in target ? target[key] : noop,
  }));
  assert.deepEqual(tools.map(t => t.name), ["web_access"]);
  assert.deepEqual(Object.keys(tools[0].parameters.properties), ["op", "input"]);
  return tools[0];
}
const rendered = result => result.content.filter(c => c.type === "text").map(c => c.text).join("\n");

test("0.41 config User-Agent reaches facade fetch; invalid config fails before any provider request", async () => {
  const tool = boot();
  const fetchPage = suffix => tool.execute(suffix, { op: "fetch", input: JSON.stringify({ url: `https://source.example/${suffix}`, mode: "raw" }) });
  for (const [settings, expected] of [[{}, "OpenAI File Downloader, XaiImageApiFetch/1.0"], [{ userAgent: "  Lean Reader/1.0  " }, "Lean Reader/1.0"]]) {
    configure(settings);
    requests.length = 0;
    const result = await fetchPage(`page-${expected.length}`);
    assert.notEqual(result.isError, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers.get("user-agent"), expected);
    assert.equal(result.structuredContent.urls[0].content, body);
    assert.equal(result.structuredContent.urls[0].error, null);
    assert.equal(result.content[0].text, body);
    assert.match(rendered(result), /stored as responseId/);
    // Page examples remain literal; result text and structured body are distinct layers.
    assert.match(result.content[0].text, /get_search_content/);
    assert.equal(result.structuredContent.responseId, result.details.responseId);
  }
  for (const userAgent of ["", "bad\r\nheader", "非ASCII", 42]) {
    configure({ userAgent });
    requests.length = 0;
    const result = await fetchPage(`invalid-${String(userAgent).length}`);
    assert.equal(result.isError, true);
    assert.match(rendered(result), /fetchContent\.userAgent.*non-empty string of printable ASCII/);
    assert.equal(result.structuredContent.urls[0].content, "");
    assert.match(result.structuredContent.urls[0].error, /fetchContent\.userAgent/);
    assert.deepEqual(requests, []);
  }
  configure();
});

test("0.41 local SearXNG works through search but cannot open other local services or page fetches", async () => {
  const tool = boot();
  const search = () => tool.execute("search-local", { op: "search", input: JSON.stringify({ query: "offline facade", provider: "searxng", workflow: "none" }) });
  requests.length = 0;
  const result = await search();
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.queries[0].error, null);
  assert.deepEqual(result.structuredContent.queries[0].results, [{ title: "Offline result", url: "https://source.example/result", snippet: "Offline snippet" }]);
  assert.match(rendered(result), /Offline result/);
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).origin, "http://localhost:8888");
  redirectSearch = true;
  requests.length = 0;
  const refused = await search();
  assert.equal(refused.isError, true);
  assert.match(refused.structuredContent.queries[0].error, /Blocked internal hostname/);
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).port, "8888");
  requests.length = 0;
  const page = await tool.execute("local-page", { op: "fetch", input: '{"url":"http://localhost:8888/private","mode":"raw"}' });
  assert.equal(page.isError, true);
  assert.equal(page.structuredContent.urls[0].content, "");
  assert.match(page.structuredContent.urls[0].error, /Blocked internal hostname/);
  assert.deepEqual(requests, []);
});
