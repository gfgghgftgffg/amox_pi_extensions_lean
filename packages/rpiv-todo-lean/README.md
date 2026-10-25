# @gfgghgftgffg/rpiv-todo-lean

Part of the [`amox-pi-extensions-lean`](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md) monorepo. A lightweight Pi facade for
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo): the
complete task-management engine with a compact schema, preserved RPC/session/overlay behavior,
and per-session isolated overlays.

Original lean facade by [kunkun9527](https://github.com/kunkun9527/rpiv-todo-lean); upstream extension
by [juicesharp](https://github.com/juicesharp/rpiv-mono). Both are MIT-licensed; the original `LICENSE`
is preserved in this package.

## Core features

* Full task lifecycle: `create`, `update`, `list`, `get`, `delete`, `clear`, status transitions,
  `blockedBy` dependencies, metadata, `/todos` command, and branch replay.
* Compact provider-facing schema: all native fields, including batch items, are retained. Verbose
  descriptions and redundant constraints are removed without changing validation; guidelines use one line.
* Upstream persistence preserved: every state-changing call still appends upstream's
  `rpiv-todo-state` custom entry so replay survives codemode-style calls.
* RPC/session behavior preserved: per-session state slots, per-session overlays, stale-context
  handling, and the shortcut/command wrappers from the original lean facade are retained.

## Installation

This is a public npm package. Install without a version pin:

```bash
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi update --extensions
```

For a Git fallback, run from the repository checkout:

```bash
node scripts/install-extension.mjs rpiv-todo-lean
```

Update a local Git installation by pulling the checkout and rerunning its installer; `pi update` does not update local contents. Keep one installation source. To migrate, back up settings, remove only the exact old source shown by `pi list`, then install the npm source. Do not load another `rpiv-todo` wrapper alongside it.

## Usage

The model sees one tool, `todo`, with actions `create`, `update`, `list`, `get`, `delete`, `clear`.
`action` is normally required; when it is omitted the facade infers `create` from `subject` or
`update` from `id` plus a mutable field, and otherwise lets upstream report the error.

New tasks default to `pending`. Create one with `subject`, or create independent tasks atomically with
`{"action":"create","tasks":[{"subject":"Inspect"},{"subject":"Test"}]}`. Batch calls require explicit
`action: "create"`; `tasks` and individual items may be JSON strings and are normalized before validation.
Use either `subject` or a nonempty `tasks` array. In a batch, put `description`, `activeForm`, `blockedBy`,
`owner`, and `metadata` on each item. Invalid items reject the whole batch without changing the list.
Items can depend on existing tasks, but cannot reference another item in the same batch; create prerequisites first.

Listing excludes deleted tasks unless `includeDeleted: true`; clearing resets task IDs to 1.
State persists through `rpiv-todo-state` entries, with legacy tool-result replay retained. Malformed saved
snapshots are skipped as a whole, retaining the latest valid snapshot. Failed calls show an error card;
model-facing errors remain in text content and `details.error`. RPC responses are not expanded with an
additional full-plan snapshot.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/rpiv-todo-lean | 0.1.9 | 277 |
| @juicesharp/rpiv-todo | 2.15.0 | 1222 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Versions

* Wrapper: `0.1.9`
* Upstream runtime: pinned to `@juicesharp/rpiv-todo@2.15.0` and `@juicesharp/rpiv-i18n@2.15.0` (exact)
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
