# @gfgghgftgffg/pi-web-access-lean

Part of the [`amox-pi-extensions-lean`](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md) monorepo. A lightweight Pi facade for
[`pi-web-access`](https://github.com/nicobailon/pi-web-access) that keeps the full upstream
search/fetch engine and compresses four provider tools into one `web_access` tool.

Original lean facade by [kunkun9527](https://github.com/kunkun9527/pi-web-access-lean); upstream engine
by [Nico Bailon](https://github.com/nicobailon/pi-web-access). Both are MIT-licensed; the original
`LICENSE` is preserved in this package.

## Core features

* Full upstream runtime: search, result pagination, source checking, page fetching, GitHub/YouTube/PDF
  extraction, provider routing, curator, and stored-result retrieval all run as upstream does.
* One provider-facing tool: `web_search`, `source_check`, `fetch_content`, and `get_search_content` are
  routed through `web_access`; upstream tools are captured, never registered twice.
* Direct local PDF extraction: `op: "fetch"` accepts local `.pdf` paths (Unix, Windows, `file:///`) that
  upstream's SSRF guard blocks, and extracts Markdown with page/character counts.
* Advanced parameters on demand: `help` returns the complete current upstream description and schema.
* No mid-session tool-list changes: the upstream `web_enable` loader is dropped and `setActiveTools`
  calls from upstream are suppressed.

## Installation

This is a public npm package. Install without a version pin:

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi update --extensions
```

For a Git fallback, run from the repository checkout:

```bash
node scripts/install-extension.mjs pi-web-access-lean
```

Update a local Git installation by pulling the checkout and rerunning its installer; `pi update` does not update local contents. Keep one installation source. To migrate, back up settings, remove only the exact old source shown by `pi list`, then install the npm source.

Do not load this package alongside another `pi-web-access` wrapper, to avoid duplicate tool
registrations.

## Usage

| `op` | Purpose | `input` |
| --- | --- | --- |
| `search` | Web search | Query string |
| `check` | Check a claim or source | Claim string |
| `fetch` | Fetch a URL or local PDF | URL or local PDF path |
| `get` | Continue a stored result | Response ID |
| `help` | Show full upstream parameters | Operation name |

```json
{ "op": "search", "input": "Pi coding agent extensions" }
```

Pass a JSON object string as `input` for batch/advanced parameters. Use `help` only when the field
names are unclear. DeepSeek search uses advanced JSON, for example:

```json
{ "op": "search", "input": "{\"query\":\"Pi extensions\",\"provider\":\"deepseek\"}" }
```

Set `deepseekApiKey` in `web-search.json` or `DEEPSEEK_API_KEY`. DeepSeek is billed per successful
search and requires explicit selection (including configured routing); `auto` and `all` exclude it.
Domain and recency filters count toward its 128-character query limit. With `includeContent: true`,
DeepSeek's returned page text is stored for `op: "get"` without fetching covered pages again.
`help` for `search` or `check` shows the current provider choices, including Linkup. Select Linkup
with `"provider":"linkup"` inside advanced JSON and set `linkupApiKey` or `LINKUP_API_KEY`.
Linkup uses account credits and is excluded from `auto`/`all`; `linkupDepth` in `web-search.json`
accepts `flash`, `fast` (default), `standard`, or `deep`.

A configured default provider array can fall back to untried `searchRouting.providers` only when
every failure matches `fallbackOn`. A provider array explicitly passed in a call remains strict.
For xAI gateways, configure an absolute HTTP(S) `xaiResponsesUrl` and `xaiApiKey` or `XAI_API_KEY`;
a custom endpoint receives that key and does not use Pi's xAI sign-in. `xaiSearchTimeoutMs` defaults
to 60,000 and accepts a positive integer capped at 600,000.

The facade stays directly available even with upstream `toolExposure: "deferred"` and
`toolActivation: "none"`; these settings do not defer `web_access` or remove its definition.
Upstream requires `"deferred"` for `"none"` and rejects combining deferred exposure with `"eager"`.

Provider gateways are configured in `web-search.json`, for example
`"deepseekBaseUrl": "https://gateway.example/deepseek"` or
`"serpapiBaseUrl": "https://gateway.example/serpapi"`. The endpoint path is appended to the
configured prefix (DeepSeek adds `/v1/tools/search` or `/v1/tools/fetch`). Matching environment
variables override config: `PI_DEEPSEEK_BASE_URL`, `PI_OLLAMA_BASE_URL`, `SERPAPI_BASE_URL`,
`JINA_SEARCH_BASE_URL`, and `MISTRAL_SEARCH_BASE_URL` are examples. Bare `DEEPSEEK_BASE_URL` and
`OLLAMA_BASE_URL` are ignored. Bases must use HTTPS (HTTP is accepted only for loopback hosts),
without embedded credentials, query parameters or fragments. Official endpoints remain the default.
Migrated provider API calls follow at most five redirects and remove their credential headers or
`api_key` query parameter on cross-origin redirects. Jina search rejects `.` and `..` queries.
These are configuration and transport behaviors; use advanced JSON for tool arguments as before.

Page answers and search summaries use the host registry's `streamSimple` path when available,
including virtual models. On Windows, `!command` credential sources prefer Git Bash or `bash.exe`
on PATH, with the default command shell as fallback. Gemini `geminiAuth: "adc"` can use an attached
GCE service account when no ADC file is configured or present; `GCE_METADATA_HOST` overrides the
metadata host and `METADATA_SERVER_DETECTION=none` disables detection.

## Fetch configuration

Readable fetch accepts short static HTML pages once useful text is extracted; pages running
scripts may still be treated as incomplete and try other configured providers.
To enable DeepSeek Fetch as a hosted fallback, add `"deepseek"` to your existing
`fetchRouting.providers`, set `fetchRouting.allowRemoteHostedProviders: true`, and provide the same
DeepSeek key used for search. Target URLs are sent to DeepSeek. It is absent from the default
fetch order and unavailable under the same-origin redirect restriction.

Set `fetchContent.userAgent` in `web-search.json` for direct HTTP page fetches:

```json
{ "fetchContent": { "userAgent": "My Reader/1.0" } }
```

Unset or null keeps `OpenAI File Downloader, XaiImageApiFetch/1.0`. Strings are trimmed; blank,
non-string, non-ASCII or CR/LF values fail before a remote request or provider fallback. This is
configuration, not a tool argument. An explicitly configured SearXNG endpoint on `localhost`,
`127.0.0.0/8` or `::1` works without globally allowing loopback in `ssrf.allowRanges`; the exemption
does not allow redirects to another local origin or ordinary page fetches to local services.

For an opt-in same-origin redirect restriction, pass advanced JSON through `input`:

```json
{ "op": "fetch", "input": "{\"url\":\"https://example.com/page\",\"redirects\":\"same-origin\"}" }
```

Alternatively set `fetchContent.redirects: "same-origin"` in `web-search.json`. Every redirect must
keep the original scheme, hostname and effective port. A refusal returns no page body and triggers
no provider fallback. Paths whose redirects cannot be observed (hosted extraction, Jina, GitHub
and YouTube) are unavailable while this policy is enabled. The default has no such restriction;
`help` for `fetch` describes the advanced parameter.

Page bodies remain literal. Upstream hints keep their original tool names: translate
`get_search_content({ ... })` to `web_access` with `op: "get"`, serializing the same argument object
as `input`; translate upstream search/fetch hints to `op: "search"` or `"fetch"`.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/pi-web-access-lean | 0.1.8 | 149 |
| pi-web-access | 0.44.0 | 2768 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Versions

* Wrapper: `0.1.8`
* Upstream runtime: pinned to `pi-web-access@0.44.0` (exact)
* Pi host tested: `1.1.0`; Node `22.22.1`

## Development

Run from the repository root: `npm ci`, `npm run check`, `npm run contracts:check`.

## Maintenance

Adaptation points, pinned upstream metadata, upgrade history, source-review decisions, and limitations
live in [MAINTENANCE.md](MAINTENANCE.md). This README describes current usage, not individual releases.

## License

MIT. This package wraps the MIT-licensed [`pi-web-access`](https://github.com/nicobailon/pi-web-access);
upstream code is consumed as a pinned npm dependency and is never copied into this repository.
