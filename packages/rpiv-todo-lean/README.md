# @gfgghgftgffg/rpiv-todo-lean

[简体中文](README.zh-CN.md)

## Advantage

A lighter wrapper for [`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo). Tasks, dependencies, batch creation and `/todos` remain, with about 77% less tool text sent on the first call.

## Features

- The model sees one `todo` tool: `create`, `update`, `list`, `get`, `delete`, `clear`.
- If `action` is omitted, a `subject` means create, and an `id` plus a mutable field means update. Anything else is reported by upstream.
- Fields, validation, persistence and per-session isolation stay on the upstream engine. `/todos` stays available.

## Source

The facade comes from [kunkun9527/rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean). The engine is [juicesharp/rpiv-todo](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo). This package follows upstream releases and does not copy the engine. Both are MIT; the original `LICENSE` is kept. It lives in [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md).

## Usage

Create one task. A `subject` alone is enough:

```json
{ "subject": "Inspect the cache" }
```

Create several:

```json
{ "action": "create", "tasks": [{ "subject": "Inspect" }, { "subject": "Test" }] }
```

Mark one finished. An `id` plus a field is an update:

```json
{ "id": "1", "status": "completed" }
```

List, read, delete, or empty the list:

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

New tasks start as `pending`. For several steps, keep one task `in_progress` and set it to `completed` when that step is done. `list` hides deleted tasks. `clear` empties the list and starts ids over. A dependency is `blockedBy`. Other fields are in the [upstream documentation](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo).

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

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/rpiv-todo-lean | 277 |
| @juicesharp/rpiv-todo | 1222 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Development

See the [development and maintenance guide](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md) and [MAINTENANCE.md](MAINTENANCE.md) for adaptation details.
