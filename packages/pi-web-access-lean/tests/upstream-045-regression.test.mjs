import assert from "node:assert/strict";
import test, { after } from "node:test";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "lean-web-045-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.env.PI_WEB_ACCESS_CACHE_ROOT = join(root, "cache");
process.env.METADATA_SERVER_DETECTION = "none";
for (const key of Object.keys(process.env)) {
  if (/_BASE_URL$/.test(key) || /^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)$/i.test(key)) delete process.env[key];
}
const config = { workflow: "none", ninerouterBaseUrl: "https://router.example/v1", fetch: { allowedModes: ["readable", "raw", "answer", "extract"] } };
const save = value => writeFileSync(join(root, "web-search.json"), JSON.stringify(value));
save(config);
const originalLookup = dns.lookup, originalFetch = globalThis.fetch;
dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
syncBuiltinESMExports();
const requests = [];
const page = "Pro monthly price: 29.\nSupported API at example.com uses TLS and returns 429 when limited.";
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  requests.push({ url: url.href, body: init?.body });
  if (url.href === "https://router.example/v1/search") return Response.json({ results: [{ title: "Price source", url: "https://source.example/pricing", snippet: "Pro monthly price: 29." }] });
  if (url.href === "https://source.example/pricing") return new Response(page, { headers: { "content-type": "text/plain" } });
  if (url.href === "https://api.cloudflare.com/client/v4/accounts/offline-account/ai/run/@cf/cloudflare/clairic") return Response.json({ success: true, result: { answers: { price: { value: 29, confidence: 0.99 } } } });
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
const call = (tool, op, input, ctx) => tool.execute(`045-${op}`, { op, input: JSON.stringify(input) }, undefined, undefined, ctx);

test("0.45 help discovers providers, search model and opt-in fields without growing resident schema", async () => {
  const tool = boot();
  for (const op of ["search", "check"]) assert.match(text(await tool.execute("help", { op: "help", input: op })), /ninerouter/);
  assert.match(text(await tool.execute("help", { op: "help", input: "search" })), /"model"/);
  assert.match(text(await tool.execute("help", { op: "help", input: "fetch" })), /"fields"/);
  save({ ...config, fetch: { allowedModes: ["readable"] } });
  try { assert.doesNotMatch(text(await boot().execute("help", { op: "help", input: "fetch" })), /"fields"/); }
  finally { save(config); }
});

test("0.45 comma-separated providers reach 9router; invalid provider and ambiguous model fail offline", async () => {
  const tool = boot(); requests.length = 0;
  const result = await call(tool, "search", { query: "pricing", provider: "ninerouter,deepseek" });
  assert.notEqual(result.isError, true);
  assert.match(text(result), /Price source/);
  assert.equal(result.structuredContent.queries[0].results[0].url, "https://source.example/pricing");
  assert.equal(JSON.parse(requests.find(r => r.url === "https://router.example/v1/search").body).provider, "serper");
  requests.length = 0;
  await assert.rejects(call(tool, "search", { query: "pricing", provider: "bogus" }), /Unknown search provider/);
  const invalid = await call(tool, "search", { query: "pricing", model: "offline-model" });
  assert.equal(invalid.isError, true);
  assert.match(text(invalid), /model requires one explicit provider/);
  assert.equal(requests.length, 0);
});

test("0.45 extract keeps rendered fields, typed extraction and stored page body distinct", async () => {
  const tool = boot(); requests.length = 0;
  const ctx = { modelRegistry: { getProviderAuth: async provider => provider === "cloudflare-workers-ai" ? { auth: { apiKey: "offline-key" }, env: { CLOUDFLARE_ACCOUNT_ID: "offline-account" } } : undefined } };
  const result = await call(tool, "fetch", { url: "https://source.example/pricing", mode: "extract", fields: { price: "number: monthly price" } }, ctx);
  assert.notEqual(result.isError, true);
  assert.match(text(result), /price: 29 \(0.99\) from/);
  const entry = result.structuredContent.urls[0];
  assert.equal(entry.content, page);
  assert.equal(entry.extraction.fields.price.value, 29);
  assert.equal(entry.extraction.fields.price.status, "extracted");
  assert.match(entry.extraction.fields.price.line, /price: 29/);
  const stored = await call(tool, "get", { responseId: result.structuredContent.responseId, urlIndex: 0 });
  assert.match(text(stored), /Supported API at example.com/);
  assert.equal(stored.details.contentLength, page.length);
  requests.length = 0;
  const invalid = await call(tool, "fetch", { url: "https://source.example/pricing", mode: "extract", fields: {} }, ctx);
  assert.equal(invalid.isError, true);
  assert.match(text(invalid), /1 to 16 fields/);
  assert.equal(requests.length, 0);
  const failed = await call(tool, "fetch", { url: "https://source.example/pricing", mode: "extract", fields: { price: "number" } });
  assert.match(text(failed), /Extraction failed/);
  assert.equal(failed.structuredContent.urls[0].content, page);
  assert.match(failed.structuredContent.urls[0].extraction.error, /only inside Pi/);
  assert.notEqual(failed.isError, true);
});

test("0.45 source check renders passages and preserves dotted-host claim sentences", async () => {
  const result = await call(boot(), "check", { claim: "API TLS 429", provider: "ninerouter", fetchContent: true });
  assert.notEqual(result.isError, true);
  const passages = result.details.artifact.passages;
  assert.ok(passages.some(p => p.text.includes("Supported API at example.com uses TLS and returns 429")));
  assert.match(text(result), /Supported API at example.com uses TLS/);
});

test("local PDF direct path rejects extract instead of silently ignoring fields", async () => {
  const path = join(root, "local.pdf"); writeFileSync(path, "offline fixture");
  const result = await call(boot(), "fetch", { url: path, mode: "extract", fields: { price: "number" } });
  assert.equal(result.isError, true);
  assert.match(text(result), /Local PDF direct extraction does not support mode extract/);
});
