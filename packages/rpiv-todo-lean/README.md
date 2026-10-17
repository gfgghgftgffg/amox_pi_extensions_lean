# @gfgghgftgffg/rpiv-todo-lean

Part of the [`amox-pi-extensions-lean`](../../README.md) monorepo. A lightweight Pi facade for
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo): the
complete task-management engine with a compact flat schema, preserved RPC/session/overlay behavior,
and per-session isolated overlays.

Original lean facade by [kunkun9527](https://github.com/kunkun9527/rpiv-todo-lean); upstream extension
by [juicesharp](https://github.com/juicesharp/rpiv-mono). Both are MIT-licensed; the original `LICENSE`
is preserved in this package.

## Core features

* Full task lifecycle: `create`, `update`, `list`, `get`, `delete`, `clear`, status transitions,
  `blockedBy` dependencies, metadata, `/todos` command, and branch replay.
* Compact provider-facing schema: the native flat schema is kept; verbose field descriptions are
  stripped and the prompt guidelines are compressed to a single line.
* Upstream persistence preserved: every state-changing call still appends upstream's
  `rpiv-todo-state` custom entry so replay survives codemode-style calls.
* RPC/session behavior preserved: per-session state slots, per-session overlays, stale-context
  handling, and the shortcut/command wrappers from the original lean facade are retained.

## Installation

Install only this extension from the repository root (clone as shown in the root README):

```bash
node scripts/install-extension.mjs rpiv-todo-lean
```

Once published to npm, install with `pi install npm:@gfgghgftgffg/rpiv-todo-lean` (no version pin), then update with `pi update --extensions`. Before first publication (npm 404), use the Git installer above. Local installs are updated by pulling the checkout and rerunning that installer, not by `pi update`. To migrate, back up settings and remove only the exact old source shown by `pi list` before installing the npm source. Choose one installation method; do not load another `rpiv-todo` wrapper alongside it.

## Usage

The model sees one tool, `todo`, with actions `create`, `update`, `list`, `get`, `delete`, `clear`.
`action` is normally required; when it is omitted the facade infers `create` from `subject` or
`update` from `id` plus a mutable field, and otherwise lets upstream report the error.

New tasks default to `pending`. Listing excludes deleted tasks unless `includeDeleted: true`;
clearing resets task IDs to 1. State persists through `rpiv-todo-state` entries, with legacy tool-result
replay retained. RPC responses are not expanded with an additional full-plan snapshot.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/rpiv-todo-lean | 0.1.4 | 247 |
| @juicesharp/rpiv-todo | 2.13.8 | 882 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Versions

* Wrapper: `0.1.4`
* Upstream runtime: pinned to `@juicesharp/rpiv-todo@2.13.8` and `@juicesharp/rpiv-i18n@2.13.8` (exact)
* Development test baseline: Pi `1.1.0`, Node `22.22.1`.

## Development

Run from the repository root: `npm ci`, `npm run check`, `npm run contracts:check`.

## Maintenance

Adaptation points, pinned upstream metadata, upgrade history, source-review decisions, and limitations
live in [MAINTENANCE.md](MAINTENANCE.md). This README describes current usage, not individual releases.

## License

MIT. This package wraps the MIT-licensed
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo);
upstream code is consumed as a pinned npm dependency and is never copied into this repository.
