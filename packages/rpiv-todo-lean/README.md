# @gfgghgftgffg/rpiv-todo-lean

Part of the [`amox-pi-extensions-lean`](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md) monorepo. A lightweight Pi facade for
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo): the
complete task-management engine behind one compact `todo` tool. Runtime updates follow upstream.

Original lean facade by [kunkun9527](https://github.com/kunkun9527/rpiv-todo-lean); upstream extension
by [juicesharp](https://github.com/juicesharp/rpiv-mono). Both are MIT-licensed; the original `LICENSE`
is preserved in this package.

## Core features

* Keeps upstream task lifecycle, dependencies, batch creation and the `/todos` interface.
* Compact descriptions and schema retain native fields, validation, persistence and session isolation.

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

Create a task with `subject`; batch creation uses `action: "create"` and `tasks`, for example
`{"action":"create","tasks":[{"subject":"Inspect"},{"subject":"Test"}]}`.
Use `id` to update or retrieve a task and `blockedBy` for dependencies.

New tasks default to `pending`. For multi-step work, keep one task `in_progress` and mark it
`completed` promptly when finished. `list` excludes deleted tasks by default; `clear` empties the list
and resets IDs. See the [upstream documentation](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo)
for all fields, batch rules and `/todos` usage.

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
