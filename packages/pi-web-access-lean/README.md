# @gfgghgftgffg/pi-web-access-lean

[![npm](https://img.shields.io/npm/v/@gfgghgftgffg/pi-web-access-lean?style=flat-square)](https://www.npmjs.com/package/@gfgghgftgffg/pi-web-access-lean)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.1.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**A single-tool, low-context facade for [`pi-web-access`](https://github.com/nicobailon/pi-web-access) — cutting registered tool text by ~87%.**

[简体中文](README.zh-CN.md)

Consolidates web search, claim verification, URL/PDF fetching, and stored-result pagination behind one `web_access` tool while delegating all execution to the upstream `pi-web-access` engine.

## Features

- **Unified `web_access` entrypoint** — Routes `search`, `check`, `fetch`, `get`, and `help` through a single tool without registering duplicate upstream tool definitions.
- **On-demand parameter discovery** — Rare flags and currently allowed search providers stay out of the permanent schema; inspect them via `op: "help"` and pass extra fields as a JSON object string in `input`.
- **Direct local PDF extraction** — Local `.pdf` paths and `file:///` URLs extract Markdown directly, returning the saved file path, Markdown content, character count, and page count (when provided by the engine).
- **Multimodal page Q&A** — Remote image and video-frame questions run through upstream `answer` mode when paired with an image-capable model, returning a text answer while keeping original source content accessible via `get`.

## Installation

Install from npm without pinning a version:

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi update --extensions
```

Or install from a local checkout of the monorepo:

```bash
node scripts/install-extension.mjs pi-web-access-lean
```

> [!IMPORTANT]
> Keep only one `pi-web-access` extension or wrapper active at a time to avoid duplicate tool registrations. Local checkout installations are updated by pulling the repository and re-running `install-extension.mjs` (`pi update` does not modify local checkouts). When migrating to npm, back up your settings, remove the exact old entry shown in `pi list`, and then install the npm package.

## Usage

Pass an explicit `op` alongside `input` (a search query, claim, URL, local PDF path, response ID, or JSON object string).

**Search the web:**

```json
{ "op": "search", "input": "Pi coding agent extensions" }
```

**Verify a factual claim:**

```json
{ "op": "check", "input": "The paper was published in 2024" }
```

**Fetch a web page or read a local PDF:**

```json
{ "op": "fetch", "input": "https://example.com/page" }
```

**Continue reading a stored response:**

```json
{ "op": "get", "input": "response-id" }
```

**Inspect all parameters and allowed providers for an operation:**

```json
{ "op": "help", "input": "fetch" }
```

**Pass advanced options as a JSON string inside `input`:**

```json
{ "op": "fetch", "input": "{\"url\":\"https://example.com/page\",\"redirects\":\"same-origin\"}" }
```

> [!TIP]
> Upstream hints may mention `get_search_content` when output is paginated or stored. Route those follow-up reads through `web_access` using `op: "get"` and put the response ID (or a JSON object string with extra retrieval fields) in `input`. Page bodies are returned unmodified.

## Configuration and Boundaries

- **Upstream configuration** — Search providers, API keys, routing rules, and fetch settings are read from `~/.pi/agent/web-search.json` (and upstream environment variables). See the [pi-web-access configuration guide](https://github.com/nicobailon/pi-web-access#configuration) for supported services and billing rules.
- **External service privacy & cost** — Queries and fetched pages may be transmitted to configured third-party search or extraction APIs and incur usage charges; review your `web-search.json` before use.
- **Proxy enforcement** — Upstream proxy settings (including `lockProxy`) apply unchanged; omit per-call `proxy` to use your configured route.
- **Local vs. remote PDFs** — Local PDF reads extract Markdown only and do not support upstream's structured `extract` mode; remote PDFs follow upstream routing.
- **Always-direct registration** — `web_access` registers directly on startup; upstream `toolExposure` / `toolActivation` deferral settings do not hide or defer this facade.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-web-access-lean | 149 |
| pi-web-access | 1110 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Source and Development

Adapted from [kunkun9527/pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) over [Nico Bailon's `pi-web-access`](https://github.com/nicobailon/pi-web-access), maintained in [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md). The upstream engine is installed as a dependency rather than copied; both projects are MIT-licensed (`LICENSE` preserved).

For repository checks and adaptation details, see the [maintenance policy](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md) and [MAINTENANCE.md](MAINTENANCE.md).
