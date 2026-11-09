# amox-pi-extensions-lean

[简体中文](README.zh-CN.md)

Three independent lean wrappers that shorten tool descriptions and schemas while keeping upstream execution, plus the standalone `amox-pi-sync` data-sync extension. Lean runtime updates follow upstream. The current [tool snapshot](maintenance/tool-contracts.json) shows about **93.5%** less tool-context text for the three lean wrappers by character count, not billed tokens; the sync package is excluded.

| Extension | Tool | Purpose |
| --- | --- | --- |
| [pi-web-access-lean](packages/pi-web-access-lean/README.md) | `web_access` | Search, verification, web pages and PDFs |
| [rpiv-todo-lean](packages/rpiv-todo-lean/README.md) | `todo` | Tasks, dependencies and progress |
| [pi-subagents-lean](packages/pi-subagents-lean/README.md) | `subagent` | Subagents and workflows |
| [amox-pi-sync](packages/amox-pi-sync/README.md) | No model tools; `/sync-*` commands | Raw agent-data sync over private SSH Git, backups and diagnostics; defaults to sessions + missions |

## Installation

Supports Linux, macOS and Windows. Requires Pi `>=1.1.0`, Node `>=22.19.0` and npm; `amox-pi-sync` also needs Git and working SSH authentication. Install only the packages you need, without version pins:

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi install npm:@gfgghgftgffg/pi-subagents-lean
pi install npm:@gfgghgftgffg/amox-pi-sync
pi update --extensions
```

Updates are manual: publication does not schedule updates on your computer. `pi update --extensions` updates npm sources, not local directories. To migrate, back up settings, find the old source with `pi list`, remove only that entry with `pi remove <old-source>`, and install its npm source. Restart Pi; keep one source per extension and do not separately load upstream engines. Service credentials and configuration are covered in each package README.

For source or fixed-tag installation, use Git and run only the required per-extension installers; root `npm ci` is not needed:

```bash
git clone https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git
cd amox_pi_extensions_lean
node scripts/install-extension.mjs pi-web-access-lean
node scripts/install-extension.mjs rpiv-todo-lean
node scripts/install-extension.mjs pi-subagents-lean
node scripts/install-extension.mjs amox-pi-sync
```

Update a local installation with `git pull --ff-only` and its installer. For a new computer, see [amox-agent-bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md).

## Maintenance and deployment

`amox-pi-sync` is a `manual-fork`: automatic upstream maintenance does not replace, adapt or version-bump it. Its current version is `0.1.0`; every package has an independent version, while the private root version (`0.1.16`) identifies a release batch. With Starline, its status capsule opens the status/actions menu; `/sync-status` also works without Starline. See the [package README](packages/amox-pi-sync/README.md) for features and limitations.

Every day at 02:23 UTC (10:23 Beijing time), systemd starts an independent Pi SDK session, not a subagent. It makes no model calls when there are no upstream updates or a maintenance PR is already open. Adaptation and actual checks run in temporary copies, without changing personal installations or replacing the maintenance host.

The fixed host merges only its own maintenance PR after exact-head Linux, macOS, Windows and `all-platforms-pass` success, fresh PR/base/main checks and a head-SHA condition. Release independently verifies the merged SHA on all three platforms, creates the GitHub Release and publishes the verified archives to npm through OIDC. CI and Release do not call a model; Release notes reuse the local Pi summary.

Optional [ntfy notifications](docs/local-scheduler.md#可选-ntfy-通知) cover success, no updates, failure and timeout. Release success is reported after the Release/npm job succeeds; notification errors do not change the maintenance result.

- [Development and maintenance policy](docs/maintenance.md)
- [Linux maintenance-host deployment](docs/local-scheduler.md)
- [Release configuration, one-time npm setup and recovery](docs/npm-publishing.md)

## Sources

Based on kunkun9527's [web](https://github.com/kunkun9527/pi-web-access-lean), [todo](https://github.com/kunkun9527/rpiv-todo-lean) and [subagent](https://github.com/kunkun9527/pi-subagents-lean) wrappers and the [lean guide](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md). Upstream implementations are dependencies, not copied code.

`amox-pi-sync` is a standalone fork of [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync), based on MIT `pi-sync-suite@0.1.1` (ref: `npm:pi-sync-suite@0.1.1`), retaining Copyright (c) 2026 Murat. It does not install the original suite; do not load both. Synced data may contain secrets: use a private SSH repository and review the package's safety limits.

License: [MIT](LICENSE).
