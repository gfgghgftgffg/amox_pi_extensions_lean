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

Preferred: install the whole monorepo as one Pi package (Git install):

```bash
pi install git:git@github.com:gfgghgftgffg/amox_pi_extensions_lean.git
```

Standalone npm publishing of this workspace package is optional and not part of phase 1. Do not load
it alongside another `rpiv-todo` wrapper.

## Usage

The model sees one tool, `todo`, with actions `create`, `update`, `list`, `get`, `delete`, `clear`.
`action` is normally required; when it is omitted the facade infers `create` from `subject` or
`update` from `id` plus a mutable field, and otherwise lets upstream report the error.

## Context footprint (character proxy)

Measured in isolated Pi 1.1.0 print-mode sessions by [`scripts/capture-contracts.mjs`](../../scripts/capture-contracts.mjs)
(see [`maintenance/tool-contracts.json`](../../maintenance/tool-contracts.json)); estimator is a fixed
`ceil(characters / 4)` proxy, **not** provider tokenization or billing.

| Variant | Tool | Registered | Active at bind |
| --- | --- | ---: | ---: |
| Lean `@gfgghgftgffg/rpiv-todo-lean@0.1.0` | `todo` | **247** | **247** |
| Upstream `@juicesharp/rpiv-todo@2.13.5` | `todo` | **882** | **882** |

## Versions

* Wrapper: `0.1.0`
* Upstream runtime: pinned to `@juicesharp/rpiv-todo@2.13.5` and `@juicesharp/rpiv-i18n@2.13.5` (exact)
* Pi host tested: `1.1.0`; Node `22.22.1`

## Development

Run from the repository root: `npm ci`, `npm run check`, `npm run contracts:check`.

## Maintenance

Adaptation points, pinned upstream metadata, upgrade steps, and limitations live in
[MAINTENANCE.md](MAINTENANCE.md).

## License

MIT. This package wraps the MIT-licensed
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo);
upstream code is consumed as a pinned npm dependency and is never copied into this repository.
