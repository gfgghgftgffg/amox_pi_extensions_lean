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
| `/sync-prune [--yes]` | Preview and delete orphan subagent sessions plus their snapshot copies |
| `/sync-settings` | Open settings and maintenance actions |
| `/sync-status` | View status and actions; also works without Starline |

The settings menu contains **View Status**, **Sync Mode** (`auto`, `manual`, `off`), **Sync Paths** (include/exclude safe relative agent-data paths), **Prune before push** (default Off), **Backups** (create/list/restore), **Diagnostics** (doctor/diff/log), and **Cleanup** (Preview, Run, Delete Selected Backup, Retention). `sessions` and `missions` are the default paths. Excluding a path stops future transfers for it; existing snapshot copies are not removed by that setting alone. Manual push and pull commands remain available in both `manual` and `off` modes.

Manual/off startup performs no network access. Auto startup computes a local fingerprint, starts timers and launches a background pull without awaiting network completion. `/sync-setup` only saves configuration and stops timers; reload to activate auto mode if enabled. With Starline installed, use its clickable status capsule to open details and actions: check status, push, pull, prune orphan sessions and settings. The status key remains `pi-sync` for existing Starline placement; the pill bridge takes precedence over legacy `extensionStatuses.commands`, with no Starline configuration changes required. There is no three-line widget. Pill clicks anchor bubbles to the corresponding Starline cell, like Model; settings, submenus and confirmations retain that anchor. `/sync-status` uses the last clicked anchor, or a centered fallback before the first click. Text entry still uses Pi input dialogs. **Bubble colour** in settings defaults to **Follow pill**; alternatively choose the current theme’s accent, success, warning or error colour for borders and selection. Before a pill click, Follow pill uses theme accent. The optional `bubbleColor` setting stores `pill`, `accent`, `success`, `warning` or `error`; changing it performs no transfer. Without Starline this option is hidden and Pi renders its native dialogs. Labels and values are separated by a colon (for example, `Paths: 2 configured`); Starline action rows start with `•`. Labels and values use Pi theme colours, while bold action rows keep Starline’s selection contrast. State shows Manual, Auto or Off directly; active operations use Push/Pull, with the configured mode shown separately. Without Starline, the native UI remains available and status output stays plain text.

## Data and safety

> [!WARNING]
> Sessions, missions and other selected files may contain secrets. Use a **private SSH repository**, review included paths, and secure both the remote and local backups. Private Git is not encryption or a secret scrubber.

- Paths are relative to Pi's agent-data directory, not the current project. Arbitrary safe data paths can be included or excluded; the extension does not change the working directory.
- Raw files are transferred without Markdown/JSON export or semantic JSONL merging. Concurrent edits are not a semantic merge; an automatic three-way merge is file-level and aborts if both sides changed the same file. Coordinate devices and inspect diagnostics.
- Deletions of previously synced files propagate: Push removes them from the snapshot, and Pull deletes local copies removed remotely, after backup. Files that were never synced are retained. A per-device `syncedPaths` baseline prevents unpulled remote files from being mistaken for local deletions. On first session start a missing baseline is seeded from files present both locally and in an existing snapshot; local-only and unpulled remote-only files stay outside it. Pre-upgrade deletions are not inferred automatically. Incoming content replaces differing same-path files after backup; active sessions must not be deleted or overwritten. Restore applies only the currently managed paths.
- **Prune orphan sessions** (action or `/sync-prune`) scans `sessions/**/*.jsonl` for subagent sessions whose parent is missing or itself pruned. It compares parent basenames case-insensitively, accepts names matching `type#8hex`, skips files modified in the last 10 minutes and the active session, shows count/size/first names, commits snapshot removals first, then deletes local files. Staged or uncommitted repository changes abort without deleting local files. `--yes` skips confirmation. **Prune before push** runs it before manual, command and automatic pushes; a prune failure warns but does not block the push.
- Network Git operations (`clone`, `fetch`, `pull`, `push`) use a 10-minute timeout; local Git operations use 60 seconds. A process terminated by timeout or cancellation is a failure and is never recorded as completed, even if Pi reports exit code 0. Pull fast-forwards when possible; otherwise it performs a clean three-way merge in the snapshot repository. Conflicts abort the merge and apply no files. A rejected non-fast-forward push fetches, integrates remote history without rebase or force, and retries once; files integrated during push are applied on the next pull.
- Git commands force `core.autocrlf=false` and `core.eol=lf`, and the snapshot repository uses a local `* -text` attribute so Git does not convert raw bytes. Existing history with mixed CRLF/LF is not rewritten automatically; normalizing it requires an explicit manual migration and repack. On Windows, SSH prefers native OpenSSH (`System32/OpenSSH/ssh.exe`) when available to support non-ASCII user directories; otherwise it uses `ssh`. Batch mode, connection timeout and host-key verification remain enabled, overriding a custom `core.sshCommand`.
- Backups use `amox-pi-sync-backups` under the agent-data directory. Pull and restore back up only the local files being replaced or deleted, and record them in the backup manifest; a pull that only adds new files creates no backup. Manual **Create backup** remains a full managed-data snapshot. Cleanup only deletes local backups after manual preview/confirmation, using complete backup directories rather than individual files. The default limits are 20 complete backups and a maximum age of 180 days; older or excess backups become cleanup candidates. There is no automatic deletion; sessions and missions are never cleanup targets.
- Settings use `amox-pi-sync.json`. If absent, legacy `pi-sync-suite.json` can be read for migration. The old file is not changed before new settings are saved; saving writes the new file. Migration uses a separate `amox-pi-sync-repo` directory rather than reusing the old snapshot.

Configuration sync/settings merging, Markdown/JSON archives, Environment Tools and Local Packages from the original suite are not included. Deployment tools such as `amox-agent-bootstrap` own environment setup and machine-specific configuration; Pi's native `/export` handles readable exports. Raw data selection, backups and manual backup cleanup remain part of sync. See [feature decisions](MAINTENANCE.md#功能取舍与维护边界) for the reasons and maintenance boundaries. This is a selectively maintained fork, not a runtime wrapper or a full replacement of the upstream suite. Daily reviews track published upstream changes, port worthwhile retained behavior, skip removed features and ask the owner through ntfy when uncertain; removed modules are not restored automatically.
