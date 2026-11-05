import assert from "node:assert/strict";
import test, { after } from "node:test";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "lean-web-047-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.env.PI_WEB_ACCESS_CACHE_ROOT = join(root, "cache");
process.env.METADATA_SERVER_DETECTION = "none";
for (const key of Object.keys(process.env)) {
  if (/_BASE_URL$/.test(key) || /^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)$/i.test(key)) delete process.env[key];
}
const config = { workflow: "none", sofyaApiKey: "offline-key", outcrawlApiKey: "offline-key", fetchRouting: { providers: ["http"] } };
const save = extra => writeFileSync(join(root, "web-search.json"), JSON.stringify({ ...config, ...extra }));
save({});
const originalLookup = dns.lookup, originalFetch = globalThis.fetch;
dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
syncBuiltinESMExports();
const requests = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  requests.push({ url: url.href, body: JSON.parse(init.body), headers: new Headers(init.headers) });
  const hits = [{ title: "Allowed source", url: "https://source.example/page", content: "Sofya snippet", snippet: "Outcrawl snippet" }, { title: "Excluded", url: "https://other.example/page", content: "Excluded", snippet: "Excluded" }];
  if (url.href === "https://sofya.co/v1/search") return Response.json({ results: hits });
  if (url.href === "https://api.outcrawl.ai/v1/search") return Response.json({ hits });
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
const call = (tool, op, input) => tool.execute(`047-${op}`, { op, input: JSON.stringify(input) });

test("new providers are discoverable and execute through JSON with filtered structured results", async () => {
  const tool = boot();
  for (const op of ["search", "check"]) {
    const help = text(await tool.execute("help", { op: "help", input: op }));
    assert.match(help, /sofya/);
    assert.match(help, /outcrawl/);
    assert.match(help, /omit by default/);
  }
  for (const provider of ["sofya", "outcrawl"]) {
    requests.length = 0;
    const result = await call(tool, "search", { query: "offline facts", provider, domainFilter: ["source.example"], recencyFilter: "week", numResults: 2 });
    assert.notEqual(result.isError, true);
    assert.deepEqual(result.structuredContent.queries[0].results, [{ title: "Allowed source", url: "https://source.example/page", snippet: provider === "sofya" ? "Sofya snippet" : "Outcrawl snippet" }]);
    assert.match(text(result), /Allowed source/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers.get("authorization"), "Bearer offline-key");
    if (provider === "sofya") {
      assert.deepEqual(requests[0].body, { query: "offline facts", search_depth: "snippets", max_results: 2, include_domains: ["source.example"], freshness: "week" });
    } else {
      assert.deepEqual(requests[0].body, { query: "offline facts site:source.example", limit: 7 });
    }
  }
});

test("locked proxy rejects direct or alternate proxy before any facade network request", async () => {
  const tool = boot();
  try {
    save({ lockProxy: true, proxy: "https://proxy.example:8443" });
    for (const op of ["search", "check", "fetch"]) {
      for (const proxy of ["", "https://other-proxy.example:8443"]) {
        requests.length = 0;
        const params = { query: "offline", claim: "offline", url: "https://source.example/page", provider: "sofya", proxy };
        await assert.rejects(call(tool, op, params), /lockProxy/);
        assert.equal(requests.length, 0);
      }
    }
    save({ lockProxy: true });
    await assert.rejects(call(tool, "search", { query: "offline", provider: "sofya" }), /no proxy is configured/);
  } finally { save({}); }
});
