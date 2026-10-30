import assert from "node:assert/strict";
import test, { after } from "node:test";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "lean-web-046-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.env.PI_WEB_ACCESS_CACHE_ROOT = join(root, "cache");
process.env.METADATA_SERVER_DETECTION = "none";
for (const key of Object.keys(process.env)) {
  if (/_BASE_URL$/.test(key) || /^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|PDF_ENDPOINT_URL|CLOUDFLARE_GATEWAY_ID|CLOUDFLARE_SEARCH_PROVIDER)$/i.test(key)) delete process.env[key];
}
const config = {
  workflow: "none", cloudflareApiKey: "offline-key", cloudflareAccountId: "offline-account",
  searchapiApiKey: "offline-key", tabstackApiKey: "offline-key",
  pdf: { provider: "endpoint", endpointUrl: "https://parser.example/parse" },
  fetchRouting: { providers: ["http"] },
};
writeFileSync(join(root, "web-search.json"), JSON.stringify(config));
const localPath = join(root, "local.pdf");
writeFileSync(localPath, "%PDF-offline-endpoint-fixture");
const originalLookup = dns.lookup, originalFetch = globalThis.fetch;
dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
syncBuiltinESMExports();
const requests = [];
let pdfPages = 3;
const body = "Offline PDF body with readable facts.\n> Pages: 999";
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  requests.push({ url: url.href, body: init?.body });
  if (url.href === "https://api.cloudflare.com/client/v4/accounts/offline-account/ai/websearch/") return Response.json({ items: [{ title: "Cloudflare source", url: "https://source.example/page", description: "Offline snippet" }] });
  if (url.origin === "https://www.searchapi.io" && url.pathname === "/api/v1/search") return Response.json({ organic_results: [{ title: "Google source", link: "https://source.example/page", snippet: "Offline snippet" }] });
  if (url.href === "https://api.tabstack.ai/v1/research") return new Response(`event: complete\ndata: ${JSON.stringify({ report: "Cited answer [1].", metadata: { citedPages: [{ title: "Tabstack source", url: "https://source.example/page", summary: "Offline snippet" }] } })}\n\n`, { headers: { "content-type": "text/event-stream" } });
  if (url.href === "https://source.example/document") return new Response("%PDF-offline-endpoint-fixture", { headers: { "content-type": "Application/PDF" } });
  if (url.href === "https://parser.example/parse") return Response.json({ markdown: body, ...(pdfPages === undefined ? {} : { pages: pdfPages }) });
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
const call = (tool, op, input) => tool.execute(`046-${op}`, { op, input: JSON.stringify(input) });

test("0.46 help and JSON search expose all three new providers through the same facade", async () => {
  const tool = boot();
  for (const op of ["search", "check"]) {
    const help = text(await tool.execute("help", { op: "help", input: op }));
    for (const provider of ["cloudflare", "searchapi", "tabstack"]) assert.ok(help.includes(provider));
  }
  for (const provider of ["cloudflare", "searchapi", "tabstack"]) {
    requests.length = 0;
    const result = await call(tool, "search", { query: "offline facts", provider });
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent.queries[0].results[0].url, "https://source.example/page");
    assert.match(text(result), /source/i);
    assert.equal(requests.length, 1);
    if (provider === "cloudflare") assert.equal(JSON.parse(requests[0].body).provider, "ceramic");
    if (provider === "searchapi") assert.equal(new URL(requests[0].url).searchParams.get("engine"), "google");
    if (provider === "tabstack") {
      assert.equal(JSON.parse(requests[0].body).mode, "fast");
      assert.equal(result.structuredContent.queries[0].answer, "Cited answer [1].");
    }
  }
});

test("local PDF returns saved Markdown and preserves counters without inventing missing pages", async () => {
  const tool = boot();
  for (const count of [3, undefined]) {
    pdfPages = count;
    const result = await call(tool, "fetch", { url: localPath });
    assert.notEqual(result.isError, true);
    const saved = readFileSync(result.details.outputPath, "utf8");
    assert.ok(saved.endsWith(body));
    assert.equal(text(result), `PDF extracted and saved to: ${result.details.outputPath}\n\n${saved}`);
    assert.equal(result.details.totalChars, saved.length);
    assert.equal(result.details.pages, count);
    if (count === undefined) assert.equal(Object.hasOwn(result.details, "pages"), false);
  }
});

test("remote mixed-case PDF returns text in rendered, structured and stored results", async () => {
  pdfPages = 3;
  const tool = boot();
  const result = await call(tool, "fetch", { url: "https://source.example/document" });
  assert.notEqual(result.isError, true);
  assert.match(text(result), /Offline PDF body/);
  const entry = result.structuredContent.urls[0];
  assert.equal(entry.error, null);
  // Readable remote PDFs intentionally include the saved-path notice in their stored content.
  assert.match(entry.content, /^PDF extracted and saved to:/);
  assert.ok(entry.content.endsWith(body));
  const retrieved = await call(tool, "get", { responseId: result.structuredContent.responseId, urlIndex: 0 });
  assert.match(text(retrieved), /Offline PDF body/);
  assert.equal(retrieved.details.contentLength, entry.content.length);
});
