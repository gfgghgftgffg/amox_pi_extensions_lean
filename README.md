# amox-pi-extensions-lean

[简体中文](README.zh-CN.md)

Five independently installable Pi extensions for search, task management, subagents, persistent goals and data sync. The lean wrappers shorten tool descriptions and schemas while retaining upstream execution. By character count, the current [tool snapshot](maintenance/tool-contracts.json) shows about **82.6%** less registered tool text across the four lean wrappers; the sync package is excluded.

| Extension | Tool | Purpose |
| --- | --- | --- |
| [pi-web-access-lean](packages/pi-web-access-lean/README.md) | `web_access` | Search, verification, web pages and PDFs |
| [rpiv-todo-lean](packages/rpiv-todo-lean/README.md) | `todo` | Tasks, dependencies and progress |
| [pi-subagents-lean](packages/pi-subagents-lean/README.md) | `subagent` | Subagents and workflows |
| [pi-goal-x-lean](packages/pi-goal-x-lean/README.md) | Original goal tools | Persistent goals, continuation and completion auditing |
| [amox-pi-sync](packages/amox-pi-sync/README.md) | No model tools; `/sync-*` commands | Raw agent-data sync over private SSH Git, deletion propagation, orphan-session pruning, backups and diagnostics; configurable sessions/missions |

Minor adaptations let subagents and goal-x work together; see the [integration notes](packages/pi-goal-x-lean/MAINTENANCE.md#subagents-and-workflow-integration-boundaries).

## Installation

Supports Linux, macOS and Windows. Requires Pi `>=1.1.0`, Node `>=22.19.0` and npm; `pi-goal-x-lean` requires Pi `>=1.4.0 <2.0.0`, and `amox-pi-sync` also needs Git and working SSH authentication. Install only the packages you need, without version pins:

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi install npm:@gfgghgftgffg/pi-subagents-lean
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi install npm:@gfgghgftgffg/amox-pi-sync
pi update --extensions
```

See each package README for service credentials and configuration.

For source or fixed-tag installation, use Git and run only the required per-extension installers; root `npm ci` is not needed:

```bash
git clone https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git
cd amox_pi_extensions_lean
node scripts/install-extension.mjs pi-web-access-lean
node scripts/install-extension.mjs rpiv-todo-lean
node scripts/install-extension.mjs pi-subagents-lean
node scripts/install-extension.mjs pi-goal-x-lean
node scripts/install-extension.mjs amox-pi-sync
```

Goal works alone; for subagents integration, install or update both npm packages. See the [goal README](packages/pi-goal-x-lean/README.md).

Update a local installation with `git pull --ff-only` and its installer. For a new computer, see [amox-agent-bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md).

## Development

- [Development and maintenance policy](docs/maintenance.md)
- [Maintenance-host deployment](docs/local-scheduler.md)
- [npm publishing setup](docs/npm-publishing.md)

## Sources

Based on kunkun9527's [web](https://github.com/kunkun9527/pi-web-access-lean), [todo](https://github.com/kunkun9527/rpiv-todo-lean) and [subagent](https://github.com/kunkun9527/pi-subagents-lean) wrappers and the [lean guide](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md). Upstream implementations are dependencies, not copied code.

`pi-goal-x-lean` is an original facade over [tmonk/pi-goal-x](https://github.com/tmonk/pi-goal-x), retaining the upstream runtime as an exact dependency.

`amox-pi-sync` is a standalone fork of [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync), based on MIT `pi-sync-suite@0.1.1` (ref: `npm:pi-sync-suite@0.1.1`), retaining Copyright (c) 2026 Murat. It does not install the original suite; do not load both. Synced data may contain secrets: use a private SSH repository and review the package's safety limits.

License: [MIT](LICENSE).
