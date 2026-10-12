import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
function makePdf(pageCount = 5) {
  const pageObjectStart = 3;
  const contentObjectStart = pageObjectStart + pageCount;
  const fontObject = contentObjectStart + pageCount;
  const pageRefs = Array.from({ length: pageCount }, (_, index) => `${pageObjectStart + index} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pageCount} >>`,
    ...Array.from({ length: pageCount }, (_, index) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObjectStart + index} 0 R >>`),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...Array.from({ length: pageCount }, (_, index) => {
      const stream = `BT /F1 24 Tf 72 720 Td (Page ${index + 1}) Tj ET`;
      return `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
    }),
  ];
  const chunks = [Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n", "binary")];
  const offsets = [0];
  let offset = chunks[0].length;
  objects.forEach((object, index) => {
    offsets[index + 1] = offset;
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, "binary");
    chunks.push(chunk);
    offset += chunk.length;
  });
  const xrefOffset = offset;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n \n`).join("")}`;
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, "binary"));
  return Buffer.concat(chunks);
}

const fixturePath = join(mkdtempSync(join(tmpdir(), "pi-web-access-lean-")), "fixture.pdf");
writeFileSync(fixturePath, makePdf());

// Keep the real upstream runtime away from the host's web-search.json/session
// state; tests must not read or write the user's live Pi agent dir.
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-access-lean-agent-"));
process.env.PI_CODING_AGENT_SESSION_DIR = join(process.env.PI_CODING_AGENT_DIR, "sessions");

import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const extensionModule = await jiti.import("../index.ts");
const extension = extensionModule.default ?? extensionModule;
const { createWebAccessFacade } = extensionModule;

function createPi() {
  const tools = [];
  const handlers = new Map();
  const noOp = () => undefined;
  const pi = new Proxy(
    {
      tools,
      handlers,
      registerTool(tool) {
        tools.push(tool);
      },
      on(event, handler) {
        const listeners = handlers.get(event) ?? [];
        listeners.push(handler);
        handlers.set(event, listeners);
      },
      registerCommand: noOp,
      registerShortcut: noOp,
      registerMessageRenderer: noOp,
      registerProvider: noOp,
      registerFlag: noOp,
      getFlag: () => undefined,
      getActiveTools: () => [],
      getAllTools: () => [],
      setActiveTools: noOp,
      appendEntry: noOp,
      sendMessage: noOp,
      events: { on: noOp, emit: noOp },
    },
    {
      get(target, property) {
        return property in target ? target[property] : noOp;
      },
    },
  );
  return pi;
}

function facadeTool(pi) {
  return pi.tools.find((tool) => tool.name === "web_access");
}

test("registers one web_access facade instead of four provider tools", () => {
  const pi = createPi();

  extension(pi);

  assert.deepEqual(
    pi.tools.map((tool) => tool.name),
    ["web_access"],
  );
});

test("real upstream help exposes the 0.32 search provider surface", async () => {
  const pi = createPi();
  extension(pi);
  const result = await facadeTool(pi).execute("help-search", { op: "help", input: "search" });
  const text = result.content.map((item) => item.text ?? "").join("\n");
  assert.match(text, /serpapi/i);
  assert.match(text, /serply/i);
});

test("search shorthand forwards the original execution context", async () => {
  const calls = [];
  const expected = {
    content: [{ type: "text", text: "search result" }],
    details: { responseId: "response-1" },
  };
  const upstream = (pi) => {
    pi.registerTool({
      name: "web_search",
      async execute(...args) {
        calls.push(args);
        return expected;
      },
    });
  };
  const pi = createPi();
  createWebAccessFacade(upstream)(pi);
  const signal = new AbortController().signal;
  const onUpdate = () => undefined;
  const context = { cwd: "C:/work" };

  const result = await facadeTool(pi).execute(
    "call-1",
    { op: "search", input: "Pi coding agent" },
    signal,
    onUpdate,
    context,
  );

  assert.deepEqual(result, expected);
  assert.deepEqual(calls, [
    ["call-1", { query: "Pi coding agent" }, signal, onUpdate, context],
  ]);
});

test("routes check, fetch, and get shorthands to their upstream tools", async () => {
  const cases = [
    ["check", "source_check", "Claim to verify", { claim: "Claim to verify" }],
    ["fetch", "fetch_content", "https://example.com", { url: "https://example.com" }],
    ["get", "get_search_content", "response-7", { responseId: "response-7" }],
  ];

  for (const [op, toolName, input, expectedParams] of cases) {
    const calls = [];
    const upstream = (pi) => {
      pi.registerTool({
        name: toolName,
        async execute(...args) {
          calls.push(args);
          return { content: [{ type: "text", text: `${op} result` }] };
        },
      });
    };
    const pi = createPi();
    createWebAccessFacade(upstream)(pi);

    await facadeTool(pi).execute(
      `call-${op}`,
      { op, input },
      undefined,
      undefined,
      { cwd: "C:/work" },
    );

    assert.deepEqual(calls[0][1], expectedParams);
  }
});

test("advanced JSON input is forwarded as the original parameter object", async () => {
  const calls = [];
  const upstream = (pi) => {
    pi.registerTool({
      name: "fetch_content",
      async execute(...args) {
        calls.push(args);
        return { content: [{ type: "text", text: "batch result" }] };
      },
    });
  };
  const pi = createPi();
  createWebAccessFacade(upstream)(pi);

  await facadeTool(pi).execute(
    "call-json",
    {
      op: "fetch",
      input: JSON.stringify({
        urls: ["https://example.com/a", "https://example.com/b"],
        mode: "raw",
      }),
    },
    undefined,
    undefined,
    { cwd: "C:/work" },
  );

  assert.deepEqual(calls[0][1], {
    urls: ["https://example.com/a", "https://example.com/b"],
    mode: "raw",
  });
});

test("help returns an upstream operation schema without executing it", async () => {
  let executions = 0;
  const upstream = (pi) => {
    pi.registerTool({
      name: "fetch_content",
      description: "Fetch full content",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          forceClone: { type: "boolean" },
        },
      },
      async execute() {
        executions += 1;
        return { content: [] };
      },
    });
  };
  const pi = createPi();
  createWebAccessFacade(upstream)(pi);

  const result = await facadeTool(pi).execute(
    "call-help",
    { op: "help", input: "fetch" },
    undefined,
    undefined,
    { cwd: "C:/work" },
  );

  assert.equal(executions, 0);
  assert.match(result.content[0].text, /fetch_content/);
  assert.match(result.content[0].text, /forceClone/);
});

test("invalid advanced JSON fails clearly before upstream execution", async () => {
  let executions = 0;
  const upstream = (pi) => {
    pi.registerTool({
      name: "web_search",
      async execute() {
        executions += 1;
        return { content: [] };
      },
    });
  };
  const pi = createPi();
  createWebAccessFacade(upstream)(pi);

  await assert.rejects(
    facadeTool(pi).execute(
      "call-invalid",
      { op: "search", input: "{not valid JSON}" },
      undefined,
      undefined,
      { cwd: "C:/work" },
    ),
    /web_access input is invalid JSON/,
  );
  assert.equal(executions, 0);
});

test("fetch on nonexistent local PDF fails with clear error", async () => {
  const pi = createPi();
  createWebAccessFacade(() => {})(pi);

  await assert.rejects(
    facadeTool(pi).execute(
      "call-nonexistent-pdf",
      { op: "fetch", input: "./nonexistent-test-file-12345.pdf" },
      undefined,
      undefined,
      { cwd: "C:/work" },
    ),
    /File not found/,
  );
});

test("fetch on local PDF with raw mode returns unsupported content type", async () => {
  const pi = createPi();
  createWebAccessFacade(() => {})(pi);

  const result = await facadeTool(pi).execute(
    "call-raw-pdf",
    {
      op: "fetch",
      input: JSON.stringify({
        url: fixturePath,
        mode: "raw",
      }),
    },
    undefined,
    undefined,
    { cwd: "C:/work" },
  );

  assert.match(result.content[0].text, /Unsupported content type in raw mode/);
});

test("fetch on valid local PDF extracts markdown directly", async () => {
  const pi = createPi();
  createWebAccessFacade(() => {})(pi);

  const result = await facadeTool(pi).execute(
    "call-local-pdf",
    { op: "fetch", input: fixturePath },
    undefined,
    undefined,
    { cwd: "C:/work" },
  );

  assert.match(result.content[0].text, /PDF extracted and saved to:/);
  assert.equal(result.details.pages, 5);
});

test("provider-facing facade metadata stays within the context budget", () => {
  const pi = createPi();
  extension(pi);
  const tool = facadeTool(pi);
  const providerMetadata = JSON.stringify({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    promptSnippet: tool.promptSnippet,
    promptGuidelines: tool.promptGuidelines,
  });

  assert.ok(
    providerMetadata.length <= 700,
    `web_access metadata grew to ${providerMetadata.length} characters`,
  );
});

test("drops upstream web_enable and never lets upstream change active tools", async () => {
  const activeCalls = [];
  const upstream = (pi) => {
    pi.registerTool({ name: "web_search", async execute() { return { content: [] }; } });
    pi.registerTool({ name: "web_enable", async execute() { return { content: [] }; } });
    pi.on("session_start", () => pi.setActiveTools(["web_enable"]));
  };
  const pi = createPi();
  pi.setActiveTools = (names) => activeCalls.push(names);
  createWebAccessFacade(upstream)(pi);
  for (const handler of pi.handlers.get("session_start") ?? []) await handler({}, {});

  assert.deepEqual(pi.tools.map((tool) => tool.name), ["web_access"]);
  assert.deepEqual(activeCalls, []);
  const help = await facadeTool(pi).execute("help", { op: "help", input: "" });
  assert.doesNotMatch(help.content[0].text, /web_enable/);
});

test("real upstream 0.39 help exposes current providers and parameters", async () => {
  const pi = createPi();
  extension(pi);
  const tool = facadeTool(pi);
  const helpText = async (op) => {
    const result = await tool.execute(`help-${op}`, { op: "help", input: op });
    return result.content.map((item) => item.text ?? "").join("\n");
  };

  const search = await helpText("search");
  for (const provider of ["serpapi", "serply", "ceramic", "degoog", "keenable"]) {
    assert.match(search, new RegExp(provider, "i"), `search help is missing ${provider}`);
  }
  assert.match(search, /"workflow"/);
  assert.match(search, /"category"/);
  assert.match(search, /"queries"/);

  const check = await helpText("check");
  assert.match(check, /"fetchContent"/);
  assert.match(check, /"proxy"/);

  const fetch = await helpText("fetch");
  for (const field of ["forceClone", "timestamp", "auth", "proxy"]) {
    assert.match(fetch, new RegExp(field), `fetch help is missing ${field}`);
  }

  const get = await helpText("get");
  assert.match(get, /findText/);
  assert.match(get, /findMode/);
});

test("real upstream execute paths answer without network access", async () => {
  const pi = createPi();
  extension(pi);
  const tool = facadeTool(pi);
  const run = (op, input) => tool.execute(`probe-${op}`, { op, input }, undefined, undefined, { cwd: "C:/work" });

  const search = await run("search", "");
  assert.match(search.content[0].text, /No query provided/);

  const fetch = await run("fetch", "");
  assert.match(fetch.content[0].text, /No URL provided/);

  const get = await run("get", "missing-response-id");
  assert.match(get.content[0].text, /No stored results/);
});

test("real upstream 0.39 prepareArguments normalizes stringified arrays before execute", async () => {
  const upstreamModule = await jiti.import("pi-web-access/index.ts");
  const realUpstream = upstreamModule.default ?? upstreamModule;
  const observed = [];
  const instrumented = (pi) => realUpstream(new Proxy(pi, {
    get(target, property, receiver) {
      if (property === "registerTool") {
        return (tool) => target.registerTool({
          ...tool,
          async execute(_callId, args) {
            observed.push(args);
            return { content: [] };
          },
        });
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }));
  const pi = createPi();
  createWebAccessFacade(instrumented)(pi);
  const tool = facadeTool(pi);

  await tool.execute(
    "call-normalize-arrays",
    {
      op: "search",
      input: JSON.stringify({
        query: "Pi",
        provider: '["parallel-mcp"]',
        queries: '["one","two"]',
        domainFilter: '["example.org"]',
      }),
    },
    undefined,
    undefined,
    { cwd: "C:/work" },
  );

  assert.deepEqual(observed, [
    { query: "Pi", provider: ["parallel-mcp"], queries: ["one", "two"], domainFilter: ["example.org"] },
  ]);

  await assert.rejects(
    tool.execute(
      "call-normalize-malformed",
      { op: "search", input: JSON.stringify({ queries: "[not valid" }) },
      undefined,
      undefined,
      { cwd: "C:/work" },
    ),
    /queries must be an array of strings/,
  );
});

test("advanced input still flows through upstream prepareArguments normalization", async () => {
  const calls = [];
  const upstream = (pi) => {
    pi.registerTool({
      name: "web_search",
      prepareArguments: (args) => ({
        ...args,
        provider: Array.isArray(args.provider) ? args.provider : [args.provider],
      }),
      async execute(...args) {
        calls.push(args);
        return { content: [{ type: "text", text: "normalized" }] };
      },
    });
  };
  const pi = createPi();
  createWebAccessFacade(upstream)(pi);

  await facadeTool(pi).execute(
    "call-prepare",
    { op: "search", input: JSON.stringify({ query: "Pi", provider: "serpapi" }) },
    undefined,
    undefined,
    { cwd: "C:/work" },
  );

  assert.deepEqual(calls[0][1], { query: "Pi", provider: ["serpapi"] });
});
