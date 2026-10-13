# @gfgghgftgffg/pi-web-access-lean

Part of the [`amox-pi-extensions-lean`](../../README.md) monorepo. A lightweight Pi facade for
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

Install only this extension from the repository root (clone as shown in the root README):

```bash
node scripts/install-extension.mjs pi-web-access-lean
```

Once published to npm, `pi install npm:@gfgghgftgffg/pi-web-access-lean` is also available. Choose one installation method.

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
names are unclear.

## Reviewed upgrade: 0.39.0 → 0.40.0

For an opt-in redirect restriction, pass advanced JSON through `input`:

```json
{ "op": "fetch", "input": "{\"url\":\"https://example.com/page\",\"redirects\":\"same-origin\"}" }
```

`help` for `fetch` exposes this option; the compact schema remains `op` + `input`.
Alternatively set `fetchContent.redirects: "same-origin"` in `web-search.json`.
Every redirect must keep the requested scheme, hostname, and effective port. A refused
redirect returns no page body and triggers no provider fallback. Paths whose redirect chain
cannot be observed (including hosted extraction, Jina, GitHub, and YouTube) are unavailable
while this policy is enabled. The default remains unrestricted by this opt-in policy.

The dependency also fixes video answer mode with transcript thumbnails, routes Gemini video
uploads through the configured gateway, and preserves Unicode characters at stored-page
boundaries (split excerpt edges use a replacement character). The lean entry needs no change.
The focused offline facade regression covers redirect help, JSON forwarding, refusal, success,
and invalid values. Live gateways/video providers are outside that test's scope.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/pi-web-access-lean | 0.1.2 | 149 |
| pi-web-access | 0.40.0 | 2739 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Versions

* Wrapper: `0.1.2`
* Upstream runtime: pinned to `pi-web-access@0.40.0` (exact)
* Pi host tested: `1.1.0`; Node `22.22.1`

## Development

Run from the repository root: `npm ci`, `npm run check`, `npm run contracts:check`.

## Maintenance

Adaptation points, pinned upstream metadata, upgrade steps, and limitations live in
[MAINTENANCE.md](MAINTENANCE.md).

## License

MIT. This package wraps the MIT-licensed [`pi-web-access`](https://github.com/nicobailon/pi-web-access);
upstream code is consumed as a pinned npm dependency and is never copied into this repository.
