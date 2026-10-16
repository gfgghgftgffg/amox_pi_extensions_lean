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

Once published to npm, `pi install npm:@gfgghgftgffg/rpiv-todo-lean` is also available. Choose one installation method; do not load another `rpiv-todo` wrapper alongside it.

## Usage

The model sees one tool, `todo`, with actions `create`, `update`, `list`, `get`, `delete`, `clear`.
`action` is normally required; when it is omitted the facade infers `create` from `subject` or
`update` from `id` plus a mutable field, and otherwise lets upstream report the error.

## Reviewed upgrade: 2.13.5 → 2.13.8

Upstream's 2.13.6–2.13.8 changelog entries contain no tool or behavior changes. The reviewed tool
schema, registration/execute path, reducer, replay/store, overlay private fields, configuration
adapter, and i18n loader/bridge are unchanged. The lean entry remains unchanged: one `todo` tool,
six actions, the same action inference, and the same per-session RPC overlays. Create still defaults
to `pending`; list excludes tombstones unless `includeDeleted: true`; clear resets task IDs to 1.
The persistence key remains `rpiv-todo-state`, with legacy tool-result replay retained.

The coupled i18n pin advances to 2.13.8; upstream's transitive rpiv-config range advances to
`^2.13.8`. See [MAINTENANCE.md](MAINTENANCE.md) for source revisions and review limits. All existing
regression assertions are preserved. The current candidate check runs installation, tests, contract capture,
production-install verification and audits; its output is the validation record. Release requires human review.

The new lean-author RPC plan-output feature was reviewed and not adopted: it appends full task snapshots
to model-visible results for all RPC hosts and adds unguarded context reads after execution. The existing
Pi 1.1 stale guards, command ordering, result envelope and overlays are retained. Pins remain 2.13.8;
unpublished engine HEAD changes are not consumed. See the itemized review in MAINTENANCE.md.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/rpiv-todo-lean | 0.1.3 | 247 |
| @juicesharp/rpiv-todo | 2.13.8 | 882 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Versions

* Wrapper: `0.1.3`
* Upstream runtime: pinned to `@juicesharp/rpiv-todo@2.13.8` and `@juicesharp/rpiv-i18n@2.13.8` (exact)
* Previous baseline testing used Pi `1.1.0`, Node `22.22.1`; candidate validation is pending in the independent job.

## Development

Run from the repository root: `npm ci`, `npm run check`, `npm run contracts:check`.

## Maintenance

Adaptation points, pinned upstream metadata, upgrade steps, and limitations live in
[MAINTENANCE.md](MAINTENANCE.md).

## License

MIT. This package wraps the MIT-licensed
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo);
upstream code is consumed as a pinned npm dependency and is never copied into this repository.
