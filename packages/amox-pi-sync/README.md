# amox-pi-sync

[简体中文](README.zh-CN.md)

Standalone Pi agent-data sync over a private SSH Git repository. Package: `@gfgghgftgffg/amox-pi-sync`. Based on [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync), `pi-sync-suite@0.1.1` (MIT; Copyright © 2026 Murat). The exact source reference is `npm:pi-sync-suite@0.1.1`; see [MAINTENANCE.md](MAINTENANCE.md).

## Install

Requires Pi `>=1.1.0`, Node `>=22.19.0`, npm, Git and working SSH authentication.

From this repository checkout:

```sh
node scripts/install-extension.mjs amox-pi-sync
```

Only this extension is installed. Do not load it alongside the original `pi-sync-suite`; inspect existing sources with `pi list` and remove the old source yourself. If the first npm publication is pending, use the checkout installer above. Once available, npm installation and updates use:

```sh
pi install npm:@gfgghgftgffg/amox-pi-sync
pi update --extensions
```

## Commands

| Command | Purpose |
| --- | --- |
| `/sync-setup git@host:owner/private-repo.git [interval]` | Configure an SSH repository and optional pull interval in minutes (no transfer) |
| `/sync-push` | Push selected raw agent data |
| `/sync-pull` | Pull selected raw agent data |
| `/sync-settings` | Open settings and maintenance actions |
| `/sync-status` | View status and actions; also works without Starline |

The settings menu contains **View Status**, **Sync Mode** (`auto`, `manual`, `off`), **Sync Paths** (include/exclude safe relative agent-data paths), **Backups** (create/list/restore), **Diagnostics** (doctor/diff/log), and **Cleanup** (Preview, Run, Delete Selected Backup, Retention). `sessions` and `missions` are the default paths. Manual push and pull commands remain available in both `manual` and `off` modes.

Manual/off startup performs no network access. Auto startup computes a local fingerprint, starts timers and launches a background pull without awaiting network completion. `/sync-setup` only saves configuration and stops timers; reload to activate auto mode if enabled. With Starline installed, use its clickable status capsule to open details and actions: check status, push, pull and settings. The status key remains `pi-sync` for existing Starline placement; the pill bridge takes precedence over legacy `extensionStatuses.commands`, with no Starline configuration changes required. There is no three-line widget. `/sync-status`, pill clicks, settings, submenus and confirmations share centered Starline bubbles above the footer; text entry still uses Pi input dialogs. Labels and values use Pi theme colours, while bold action rows keep Starline’s selection contrast. State shows Manual, Auto or Off directly; active operations use Push/Pull, with the configured mode shown separately. Without Starline, the native UI remains available and status output stays plain text.

## Data and safety

> [!WARNING]
> Sessions, missions and other selected files may contain secrets. Use a **private SSH repository**, review included paths, and secure both the remote and local backups. Private Git is not encryption or a secret scrubber.

- Paths are relative to Pi's agent-data directory, not the current project. Arbitrary safe data paths can be included or excluded; the extension does not change the working directory.
- Raw files are transferred without Markdown/JSON export or JSONL merging. Concurrent edits are not a semantic merge; coordinate devices and inspect diagnostics.
- Local-only files are retained; deletions are not propagated. Incoming content replaces differing same-path files after backup; active sessions must not be overwritten. Restore applies only the currently managed paths.
- Git commands disable automatic line-ending conversion so Windows `core.autocrlf` does not rewrite raw sessions. SSH uses system `ssh` with batch mode and a connection timeout, overriding a custom `core.sshCommand`.
- Backups use `amox-pi-sync-backups` under the agent-data directory. Cleanup only deletes local backups after manual preview/confirmation, using complete backup directories rather than individual files. The default limits are 20 complete backups and a maximum age of 180 days; backups older than this or beyond the newest 20 become cleanup candidates. There is no automatic deletion; sessions and missions are never cleanup targets.
- Settings use `amox-pi-sync.json`. If absent, legacy `pi-sync-suite.json` can be read for migration. The old file is not changed before new settings are saved; saving writes the new file. Migration uses a separate `amox-pi-sync-repo` directory rather than reusing the old snapshot.

Configuration sync/settings merging, Markdown/JSON archives, Environment Tools and Local Packages from the original suite are not included. Deployment tools such as `amox-agent-bootstrap` own environment setup and machine-specific configuration; Pi's native `/export` handles readable exports. Raw data selection, backups and manual backup cleanup remain part of sync. See [feature decisions](MAINTENANCE.md#功能取舍与维护边界) for the reasons and maintenance boundaries. This is a selectively maintained fork, not a runtime wrapper or a full replacement of the upstream suite. Daily reviews track published upstream changes, port worthwhile retained behavior, skip removed features and ask the owner through ntfy when uncertain; removed modules are not restored automatically.
