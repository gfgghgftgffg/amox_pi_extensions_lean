# @gfgghgftgffg/rpiv-todo-lean

[![npm](https://img.shields.io/npm/v/@gfgghgftgffg/rpiv-todo-lean?style=flat-square)](https://www.npmjs.com/package/@gfgghgftgffg/rpiv-todo-lean)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.1.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**A compact facade for [`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo) — keeping full task tracking and `/todos` with ~77% less registered tool text.**

[简体中文](README.zh-CN.md)

Strips verbose schema descriptions from `todo` while preserving task creation, batching, dependencies, per-session isolation, RPC overlays, and terminal UI controls on the upstream engine.

## Features

- **Compact single-tool schema** — Exposes one `todo` tool (`create`, `update`, `list`, `get`, `delete`, `clear`) with concise instructions and identical structural validation.
- **Smart shorthand inference** — When `action` is omitted, passing `subject` infers `create`, and passing `id` with a mutable field infers `update`; ambiguous inputs defer to upstream validation errors.
- **Configurable TUI panel** — Set `maxWidgetLines: 0` in your [todo configuration](https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-todo/docs/configuration.md) to hide the widget on the next repaint while keeping `todo` and `/todos` active. In Pi's fullscreen TUI, left-clicking the panel heading collapses or expands it even when `collapseKey: "off"`.
- **Clean multi-session & workflow coordination** — Child sessions starting work no longer hide completed rows in the foreground session's panel. In Pi's terminal UI, the Todo panel automatically hides while Autoresearch mode is active or while the current session owns an active Goal (requires `pi-goal-x-lean` `>=0.1.7`), and reappears once both workflows are paused or turned off.

## Installation

Install from npm without pinning a version:

```bash
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi update --extensions
```

Or install from a local checkout of the monorepo:

```bash
node scripts/install-extension.mjs rpiv-todo-lean
```

> [!IMPORTANT]
> Do not load another `rpiv-todo` extension or wrapper at the same time. Local checkout installations are updated by pulling the repository and re-running `install-extension.mjs` (`pi update` does not update local checkouts). To migrate from a local source to npm, back up settings, remove the exact old entry listed in `pi list`, and install the npm package.

## Usage

**Create a single task (`subject` alone infers `create`):**

```json
{ "subject": "Inspect the cache" }
```

**Create multiple tasks atomically:**

```json
{ "action": "create", "tasks": [{ "subject": "Inspect" }, { "subject": "Test" }] }
```

**Update a task (`id` + mutable field infers `update`):**

```json
{ "id": "1", "status": "completed" }
```

**List, inspect, delete, or clear tasks:**

```json
{ "action": "list" }
```

```json
{ "action": "get", "id": "1" }
```

```json
{ "action": "delete", "id": "1" }
```

```json
{ "action": "clear" }
```

> [!TIP]
> New tasks start as `pending`. During multi-step work, keep one active step `in_progress` and mark it `completed` as soon as it finishes. `list` omits deleted tasks by default, `clear` empties the list and resets ID numbering, and task dependencies use `blockedBy`. Additional fields are documented [upstream](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo).

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/rpiv-todo-lean | 277 |
| @juicesharp/rpiv-todo | 1281 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Source and Development

Adapted from [kunkun9527/rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) over [juicesharp/rpiv-todo](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo), maintained in [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md). Upstream logic stays in npm dependencies without copied engine code; both projects are MIT-licensed (`LICENSE` preserved).

See the [maintenance policy](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md) and [MAINTENANCE.md](MAINTENANCE.md) for RPC stale-context guards and adaptation notes.
