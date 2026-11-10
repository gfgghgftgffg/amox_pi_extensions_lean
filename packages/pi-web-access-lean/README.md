# @gfgghgftgffg/pi-web-access-lean

[简体中文](README.zh-CN.md)

## Advantage

A lighter wrapper for [`pi-web-access`](https://github.com/nicobailon/pi-web-access). Search, checks, fetches and stored results share one `web_access` tool, cutting the tool text sent on the first call by about 87%.

## Features

- One tool covers `search`, `check`, `fetch`, `get` and `help`. The upstream engine still runs, and this package does not register those upstream tools a second time.
- Local PDF paths and `file:///` return the saved Markdown and its path. Metadata includes the Markdown character count and, when the engine provides it, the page count. This path extracts Markdown only, not the upstream structured extract mode.
- Uncommon parameters stay in `help`, including the allowed search providers. Pass them as a JSON object string in `input`.

## Source

The facade comes from [kunkun9527/pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean). The engine is [Nico Bailon's pi-web-access](https://github.com/nicobailon/pi-web-access). This package follows upstream releases and does not copy the engine. Both are MIT; the original `LICENSE` is kept. It lives in [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md).

## Usage

Call `web_access` with `op` and `input`.

Search:

```json
{ "op": "search", "input": "Pi coding agent extensions" }
```

Check a claim:

```json
{ "op": "check", "input": "The paper was published in 2024" }
```

Fetch a page or a local PDF:

```json
{ "op": "fetch", "input": "https://example.com/page" }
```

Continue a saved result. `input` is the response id from an earlier call:

```json
{ "op": "get", "input": "response-id" }
```

See every parameter for one operation:

```json
{ "op": "help", "input": "fetch" }
```

Extra fields go inside the `input` string as JSON:

```json
{ "op": "fetch", "input": "{\"url\":\"https://example.com/page\",\"redirects\":\"same-origin\"}" }
```

If a result names an upstream tool, call the matching `web_access` operation instead. Page text is left as returned.

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

## Configuration and limits

Providers, credentials, search routing and fetch options use upstream's `web-search.json`, normally
under `~/.pi/agent/`. See the [upstream documentation](https://github.com/nicobailon/pi-web-access#configuration)
for configuration paths, environment variables, supported services and billing rules. External services
may receive queries and page content and incur charges; review their configuration before use. Proxy
policy, including optional `lockProxy`, follows upstream; omit per-call `proxy` to use the configured route.

Direct local PDF access extracts Markdown only, not upstream's structured `extract` mode; remote PDFs
use upstream handling. `web_access` stays registered directly: upstream dynamic tool-loading settings
do not defer or remove this entrypoint.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-web-access-lean | 149 |
| pi-web-access | 1110 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Development

See the [development and maintenance guide](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md) and [MAINTENANCE.md](MAINTENANCE.md) for adaptation details.
