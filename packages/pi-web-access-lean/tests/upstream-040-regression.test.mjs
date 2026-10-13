import assert from "node:assert/strict";
import test, { after } from "node:test";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "lean-web-040-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.env.PI_WEB_ACCESS_CACHE_ROOT = join(root, "cache");
writeFileSync(join(root, "web-search.json"), JSON.stringify({ workflow: "none", fetchRouting: { providers: ["http"] } }));

// Install both transport mocks before loading any upstream module.
const originalLookup = dns.lookup;
const originalFetch = globalThis.fetch;
dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
syncBuiltinESMExports();
const fetched = [];
globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  fetched.push(url);
  if (url.endsWith("/cross")) return new Response("", { status: 302, headers: { location: "https://other.example/body" } });
  if (url.endsWith("/same")) return new Response("", { status: 302, headers: { location: "/body" } });
  assert.equal(url, "https://source.example/body", `unexpected outbound request: ${url}`);
  return new Response("OFFLINE_PAGE_BODY", { headers: { "content-type": "text/plain" } });
};
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { default: extension } = await jiti.import("../index.ts");
after(() => {
  dns.lookup = originalLookup;
  syncBuiltinESMExports();
  globalThis.fetch = originalFetch;
  rmSync(root, { recursive: true, force: true });
});

function boot() {
  const tools = [];
  const noop = () => undefined;
  const pi = new Proxy({ registerTool: tool => tools.push(tool), on: noop, events: { on: noop, emit: noop }, getActiveTools: () => [], getAllTools: () => [] }, {
    get: (target, key) => key in target ? target[key] : noop,
  });
  extension(pi);
  assert.deepEqual(tools.map(t => t.name), ["web_access"]);
  assert.deepEqual(Object.keys(tools[0].parameters.properties), ["op", "input"]);
  return tools[0];
}

 test("0.40 redirect option stays in help and JSON input enforces it through the real facade", async () => {
  const tool = boot();
  const help = await tool.execute("help", { op: "help", input: "fetch" });
  const text = help.content.filter(c => c.type === "text").map(c => c.text).join("\n");
  assert.match(text, /"redirects"/);
  assert.match(text, /same-origin/);
  const run = (path, redirects) => tool.execute(path, { op: "fetch", input: JSON.stringify({ url: `https://source.example/${path}`, mode: "raw", redirects }) });

  fetched.length = 0;
  const refused = await run("cross", "same-origin");
  assert.equal(refused.isError, true);
  assert.match(refused.content.find(c => c.type === "text").text, /Refused cross-origin redirect/);
  assert.equal(refused.structuredContent.urls[0].content, "");
  assert.match(refused.structuredContent.urls[0].error, /Refused cross-origin redirect/);
  assert.deepEqual(fetched, ["https://source.example/cross"]);

  fetched.length = 0;
  const allowed = await run("same", "same-origin");
  assert.notEqual(allowed.isError, true);
  assert.equal(allowed.structuredContent.urls[0].content, "OFFLINE_PAGE_BODY");
  assert.equal(allowed.structuredContent.urls[0].error, null);
  assert.equal(allowed.content.find(c => c.type === "text").text, "OFFLINE_PAGE_BODY");
  assert.equal(typeof allowed.details.responseId, "string");
  assert.deepEqual(fetched, ["https://source.example/same", "https://source.example/body"]);

  fetched.length = 0;
  const invalid = await run("same", "all");
  assert.equal(invalid.isError, true);
  assert.match(invalid.content.find(c => c.type === "text").text, /redirects must be "same-origin"/);
  assert.deepEqual(fetched, []);
});
