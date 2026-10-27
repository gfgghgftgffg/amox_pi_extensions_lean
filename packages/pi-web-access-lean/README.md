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

Pass an explicit `op` and a string `input`; serialize batch or advanced parameters as a JSON object
inside that string. Use `help` only when the field names are unclear. DeepSeek search uses advanced JSON, for example:

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
every failure matches `fallbackOn`. In tool-call JSON, use a provider name or comma-separated names
such as `"provider":"brave,exa"`; explicit lists remain strict. Legacy arrays and stringified arrays
remain accepted by this facade. Unknown names fail instead of selecting auto.
Search `model` selects a model for exactly one explicit `openai`, `xai`, `mistral`, or `gemini` provider
(Gemini API only); it cannot be combined with `summary-review` and never retries another model.
Select `"provider":"ninerouter"` for 9router and set `ninerouterBaseUrl` (for example
`https://router.example/v1`) or `NINEROUTER_BASE_URL`. Its backend defaults to `serper`, configurable
with `ninerouterProvider` / `NINEROUTER_SEARCH_PROVIDER`; its API key is optional. Auto/all exclude it.
`searchRouting.fallbackOn` also accepts `empty`, `domain-miss`, and `off-topic` (the last needs
`searchRouting.offTopicModel`). `searchRouting.timeoutMs` sets a total route budget of 1–600000 ms.
If all answers are passed over, the first is returned. DuckDuckGo serializes requests at least two
seconds apart and backs off after bot checks, allowing configured quota/network fallback.
`op: "check"` now includes source passages in its rendered output, up to 4000 characters per source.
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
`OLLAMA_BASE_URL` are ignored. Bases require HTTPS by default (loopback HTTP is accepted).
`allowHttpBaseUrls: true` or `PI_WEB_ACCESS_ALLOW_HTTP_BASE_URLS=true` also permits HTTP on other
hosts; use only trusted networks because API keys travel unencrypted. Bases cannot contain embedded
credentials, query parameters or fragments. Official endpoints remain the default.
Migrated provider API calls follow at most five redirects and remove their credential headers or
`api_key` query parameter on cross-origin redirects. Jina search rejects `.` and `..` queries.
These are configuration and transport behaviors; use advanced JSON for tool arguments as before.

Page answers and search summaries use the host registry's `streamSimple` path when available,
including virtual models. Set `summaryModel` or `queryRewriteModel` to `current[:level]` or
`provider/model-id[:level]` to select one helper model. An explicit summary model never silently
switches to a cloud model: failure yields a deterministic summary with a reason; an invalid selector
errors. Query rewriting also uses only the selected model. Scope restrictions still apply.
Azure OpenAI search uses your `/openai/v1/responses` endpoint and deployment name via
`openaiResponsesUrl` / `openaiSearchModel`; Azure API keys use `api-key`, Entra tokens use Bearer.
Azure rejects `openaiUseAlphaSearch`; Bing grounding has separate Microsoft billing/privacy terms.
Exa results include publication dates/authors and, for category `publication`, DOI/citation metadata;
the older `research paper` category remains an alias.
On Windows, `!command` credential sources prefer Git Bash or `bash.exe`
on PATH, with the default command shell as fallback. Gemini `geminiAuth: "adc"` can use an attached
GCE service account when no ADC file is configured or present; `GCE_METADATA_HOST` overrides the
metadata host and `METADATA_SERVER_DETECTION=none` disables detection.

## Fetch configuration

For specific typed values, opt in with `"fetch":{"allowedModes":["readable","raw","answer","extract"]}`
in `web-search.json`, then pass advanced JSON, for example:

```json
{ "op": "fetch", "input": "{\"url\":\"https://example.com/pricing\",\"mode\":\"extract\",\"fields\":{\"price\":\"number: Pro monthly price\"}}" }
```

Extract sends fetched page text to Cloudflare Clairic using Pi's `cloudflare-workers-ai` credentials
(`CLOUDFLARE_API_KEY` and `CLOUDFLARE_ACCOUNT_ID`; optional `CLOUDFLARE_GATEWAY_ID`). `fields` maps
1–16 names to types such as `text`, `number`, `integer`, `date`, or `list`, optionally followed by
`: what to find`. Results distinguish extracted values, uncertain guesses and missing values;
text/number results may include a source line. Typed data is in `structuredContent.urls[].extraction`
and `details.extractions`, while `urls[].content` and `op: "get"` retain the fetched page body.
An extraction failure can coexist with a successful stored fetch; inspect the extraction error.
Extract is disabled by default, cannot be the default mode, and rejects `auth`. The local PDF direct
path supports Markdown extraction only and explicitly rejects `mode: "extract"`; remote PDF URLs
use the upstream path. `help` for `fetch` shows `fields` only when extract is enabled.

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
| @gfgghgftgffg/pi-web-access-lean | 0.1.11 | 149 |
| pi-web-access | 0.45.0 | 1110 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Versions

* Wrapper: `0.1.11`
* Upstream runtime: pinned to `pi-web-access@0.45.0` (exact)
* Pi host tested: `1.1.0`; Node `22.22.1`

## Development

Run from the repository root: `npm ci`, `npm run check`, `npm run contracts:check`.

Upstream code is an exact-version npm dependency, not copied source. See [MAINTENANCE.md](MAINTENANCE.md) for adaptation details and limitations.
