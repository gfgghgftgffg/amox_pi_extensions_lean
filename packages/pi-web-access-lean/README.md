# @gfgghgftgffg/pi-web-access-lean

Part of the [`amox-pi-extensions-lean`](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md) monorepo. A lightweight Pi facade for
[`pi-web-access`](https://github.com/nicobailon/pi-web-access) that keeps the full upstream
search/fetch engine and compresses four provider tools into one `web_access` tool. Runtime updates follow upstream.

Original lean facade by [kunkun9527](https://github.com/kunkun9527/pi-web-access-lean); upstream engine
by [Nico Bailon](https://github.com/nicobailon/pi-web-access). Both are MIT-licensed; the original
`LICENSE` is preserved in this package.

## Core features

* Routes upstream search, checking, fetching and stored-content tools through `web_access`, without duplicate registrations.
* Direct local PDF access accepts Unix/Windows paths and `file:///`, returning Markdown, page and character counts.
* Advanced parameters on demand: `help` returns the installed upstream's full description and schema.

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
inside that string, for example:

```json
{ "op": "fetch", "input": "{\"url\":\"https://example.com/page\",\"redirects\":\"same-origin\"}" }
```

When parameters are unclear, call `help` with `input` set to the operation name for the installed
runtime's full description and schema. Translate upstream tool hints in results to the corresponding
`web_access` operation; page bodies are not rewritten.

## Configuration and limits

Providers, credentials, search routing and fetch options use upstream's `web-search.json`, normally
under `~/.pi/agent/`. See the [upstream documentation](https://github.com/nicobailon/pi-web-access#configuration)
for configuration paths, environment variables, supported services and billing rules. External services
may receive queries and page content and incur charges; review their configuration before use.

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
