# amox-pi-extensions-lean

[简体中文](README.zh-CN.md)

Three independent lean wrappers. Tool descriptions and schemas are shortened; execution still uses exact-version upstream dependencies. Maintenance updates those pins when upstream changes pass verification; the three wrappers share a release version even when a runtime is unchanged. The current [tool snapshot](maintenance/tool-contracts.json) shows about **93.5%** less tool-context text by character count, not billed tokens.

| Extension | Tool | Purpose |
| --- | --- | --- |
| [pi-web-access-lean](packages/pi-web-access-lean/README.md) | `web_access` | Search, verification, web pages and PDFs |
| [rpiv-todo-lean](packages/rpiv-todo-lean/README.md) | `todo` | Tasks, dependencies and progress |
| [pi-subagents-lean](packages/pi-subagents-lean/README.md) | `subagent` | Subagents and workflows |

## Installation

Supports Linux, macOS and Windows. Requires Pi `>=1.1.0`, Node `>=22.19.0` and npm. All three npm packages are public; install only those you need, without version pins:

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi install npm:@gfgghgftgffg/pi-subagents-lean
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
```

Update a local installation with `git pull --ff-only` and its installer. For a new computer, see [amox-agent-bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md).

## Maintenance and deployment

Every day at 02:23 UTC (10:23 Beijing time), systemd starts an independent Pi SDK session, not a subagent. It makes no model calls when there are no upstream updates or a maintenance PR is already open. Adaptation and actual checks run in temporary copies, without changing personal installations or replacing the maintenance host.

The fixed host merges only its own maintenance PR after exact-head Linux, macOS, Windows and `all-platforms-pass` success, fresh PR/base/main checks and a head-SHA condition. Release independently verifies the merged SHA on all three platforms, creates the GitHub Release and publishes the verified archives to npm through OIDC. CI and Release do not call a model; Release notes reuse the local Pi summary.

Optional [ntfy notifications](docs/local-scheduler.md#可选-ntfy-通知) cover success, no updates, failure and timeout. Release success is reported after the Release/npm job succeeds; notification errors do not change the maintenance result.

- [Development and maintenance policy](docs/maintenance.md)
- [Linux maintenance-host deployment](docs/local-scheduler.md)
- [Release configuration, one-time npm setup and recovery](docs/npm-publishing.md)

## Sources

Based on kunkun9527's [web](https://github.com/kunkun9527/pi-web-access-lean), [todo](https://github.com/kunkun9527/rpiv-todo-lean) and [subagent](https://github.com/kunkun9527/pi-subagents-lean) wrappers and the [lean guide](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md). Upstream implementations are dependencies, not copied code.

License: [MIT](LICENSE).
