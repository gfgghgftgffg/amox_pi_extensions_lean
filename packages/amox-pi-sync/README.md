# amox-pi-sync

[简体中文](README.zh-CN.md)

## Advantage

Sync Pi sessions through a private Git repository, with paths you choose. Delete the current session and its descendants with `/delete-session`, or clean up orphan subagent sessions with `/sync-prune`, and propagate the deletion.

## Features

- Default paths are `sessions` and `missions`. You can include or exclude other agent-data paths. Files move as-is: no Markdown export and no JSONL merge. If both sides changed the same file, sync stops.
- `/delete-session` previews the current session and its descendant tree by default, switches to a fresh session, then deletes the selected files and their snapshot copies. Recent and renamed descendants, including manual forks, are included; unrelated orphans are untouched.
- `/sync-prune` finds subagent sessions whose parent is gone, including descendants, previews them, and syncs that deletion. It does not run before push unless you turn that on.
- A pull backs up only the files it is about to replace or delete.
- With [Starline](https://github.com/Andy8647/pi-starline), a status capsule opens the actions. Without it, the same actions stay on `/sync-*`.

## Source

`@gfgghgftgffg/amox-pi-sync` is a selective fork of [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync), based on MIT `pi-sync-suite@0.1.1` (Copyright © 2026 Murat). The source ref is `npm:pi-sync-suite@0.1.1`. Transport is SSH Git. See [MAINTENANCE.md](MAINTENANCE.md).

## Usage

Point it at a private SSH Git repository. This does not transfer files yet:

```text
/sync-setup git@host:owner/private-repo.git
```

Send local sessions, then bring remote sessions back:

```text
/sync-push
/sync-pull
```

Delete the current session and all its descendants. Confirmation is on by default; disable **Confirm session deletion** in `/sync-settings` to delete without a dialog. Requires sync setup and `sessions` in managed paths:

```text
/delete-session
```

The command switches to a fresh session before deleting. Close other Pi processes using these sessions first. Snapshot removals are committed locally; manual/off mode needs `/sync-push` to publish them, while auto mode uses its normal sync loop. Git history, backups and `/tmp` files remain. If the tree gains new descendants before execution, deletion stops rather than widening the scanned selection.

Preview orphan subagent sessions, then delete them and sync that deletion:

```text
/sync-prune
/sync-prune --yes
```

`/sync-status` opens the same actions without [Starline](https://github.com/Andy8647/pi-starline). `/sync-settings` changes paths and whether prune runs before push.

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

## Proxy configuration

Native Windows SSH runs through the packaged Node launcher, which removes OpenSSH’s internal descriptor-inheritance state only from the SSH child environment. This prevents I/O waits when Git/Node replace the pipes, without changing the parent environment.

For SSH Git through an HTTP proxy, add `"proxy": "http://127.0.0.1:7897"` to your existing agent-data `amox-pi-sync.json`, then reload Pi. Remove the field to connect directly. This uses HTTP CONNECT for SSH; it does not change global Git, SSH or system proxy settings. SSH authentication and host-key verification remain enabled. Only `http://` proxy endpoints are supported, without credentials, extra URL paths, query strings or fragments. The proxy must allow CONNECT to your SSH server and port.

For GitHub through a proxy that blocks SSH port 22, set `repoUrl` to `ssh://git@ssh.github.com:443/OWNER/REPO.git` in the same file. This is still SSH, not HTTPS; verify GitHub’s published host-key fingerprint if SSH asks to trust the alternate endpoint. For an existing snapshot repository, also update its `origin` to the same URL: `git -C "<repoDir>" remote set-url origin "ssh://git@ssh.github.com:443/OWNER/REPO.git"`, replacing `<repoDir>` with the configured snapshot path. Any explicit push URLs must match too. Changing only `repoUrl` is rejected when the existing origin differs; these configuration changes do not transfer data. Reload Pi after updating both values. A CONNECT 200 response alone does not prove the SSH route works. An empty tunnel now reports the destination and, for `github.com:22`, this alternate URL; the extension never silently changes destinations or retries directly.

The confirmation preference is also stored here as `"confirmSessionDelete": false`; omitting it keeps confirmation on. Changing that preference in the menu saves locally without starting a sync.

## Details

- A per-device `syncedPaths` baseline records paths present at the last successful push or pull. Push removes previously synced paths that are now missing locally. Pull applies remote deletions after a backup and keeps local missing baseline paths as pending deletions, so a pull before push does not resurrect them. Files that were never synced, and remote-only files not yet pulled, are not deleted. The first baseline is the intersection of local and snapshot paths; deletions from before that baseline are not inferred.
- Targeted deletion follows parent links recursively without a name filter or a ten-minute age limit. It shares the portable basename lookup and duplicate-name ambiguity protection with orphan prune. The outgoing runtime must finish shutdown before deletion, and the replacement instance processes deletion before its automatic Pull. A deletion failure pauses automatic sync until the error is resolved and sync is restarted or the extension reloaded.
- Orphan prune compares parent basenames without case sensitivity, accepts names matching `type#8hex`, and cascades to descendants. It skips files modified in the last 10 minutes and the active session, previews count, size and names, writes the snapshot deletion before deleting locally, and refuses a dirty repository. Prune before push is off by default. A prune failure warns and does not block the push.
- Network Git operations time out after 10 minutes. Local Git operations time out after 60 seconds. A process ended by timeout or cancellation is a failure, even if Pi reports exit code 0. Pull fast-forwards when it can; otherwise it does a clean three-way merge. A rejected non-fast-forward push fetches, integrates without rebase or force, and retries once.
- Pull and restore back up only the local files being replaced or deleted. A pull that only adds files creates no backup. Manual create-backup is still a full snapshot of managed data.
- Windows prefers native OpenSSH (`System32/OpenSSH/ssh.exe`) when it is available. Git commands force `core.autocrlf=false` and `core.eol=lf`, and the snapshot repo uses a local `* -text` attribute. Existing mixed line endings are not rewritten.

## Settings and UI

- The settings menu contains **View Status**, **Sync Mode** (`auto`, `manual`, `off`), **Sync Paths** (include/exclude safe relative agent-data paths), **Prune before push** (default Off), **Confirm session deletion** (default On), **Backups** (create/list/restore), **Diagnostics** (doctor/diff/log), and **Cleanup** (Preview, Run, Delete Selected Backup, Retention). Excluding a path stops future transfers for it; existing snapshot copies are not removed by that setting alone.
- Manual/off startup performs no network access. Auto startup computes a local fingerprint, starts timers and launches a background pull without awaiting network completion. `/sync-setup` only saves configuration and stops timers; reload to activate auto mode if enabled.
- With [Starline](https://github.com/Andy8647/pi-starline), the clickable status capsule opens details and actions. The status key remains `pi-sync` for existing placement; the pill bridge takes precedence over legacy `extensionStatuses.commands`. There is no three-line widget.
- Pill clicks anchor bubbles to the corresponding Starline cell, like Model; settings, submenus and confirmations retain that anchor. `/sync-status` uses the last clicked anchor, or a centered fallback before the first click. Text entry still uses Pi input dialogs.
- **Bubble colour** defaults to **Follow pill**; alternatively choose the current theme’s accent, success, warning or error colour for borders and selection. Before a pill click, Follow pill uses theme accent. The optional `bubbleColor` setting stores `pill`, `accent`, `success`, `warning` or `error`; changing it performs no transfer. Without Starline this option is hidden and Pi renders its native dialogs.
- Labels and values are separated by a colon (for example, `Paths: 2 configured`); Starline action rows start with `•`. Labels and values use Pi theme colours, while bold action rows keep Starline’s selection contrast. After deletion, State returns to Manual, Auto or Off instead of retaining Delete session; completed operations belong in Last action. Active transfers use Push/Pull, with the configured mode shown separately. RPC and no-Starline output stay plain text.

## Data and safety

> [!WARNING]
> Sessions, missions and other selected files may contain secrets. Use a **private SSH repository**, review included paths, and secure both the remote and local backups. Private Git is not encryption or a secret scrubber.

- Paths are relative to Pi's agent-data directory, not the current project. Arbitrary safe data paths can be included or excluded; the extension does not change the working directory.
- Concurrent edits are not a semantic merge. Coordinate devices and inspect diagnostics. Incoming content replaces differing same-path files after backup; active sessions must not be deleted or overwritten. Restore applies only the currently managed paths.
- Backups use `amox-pi-sync-backups` under the agent-data directory. Cleanup only deletes local backups after manual preview/confirmation, using complete backup directories rather than individual files. The default limits are 20 complete backups and a maximum age of 180 days; older or excess backups become cleanup candidates. There is no automatic deletion; sessions and missions are never cleanup targets.
- Settings use `amox-pi-sync.json`. If absent, legacy `pi-sync-suite.json` can be read for migration. The old file is not changed before new settings are saved; saving writes the new file. Migration uses a separate `amox-pi-sync-repo` directory rather than reusing the old snapshot.

Configuration sync/settings merging, Markdown/JSON archives, Environment Tools and Local Packages from the original suite are not included. Deployment tools such as `amox-agent-bootstrap` own environment setup and machine-specific configuration; Pi's native `/export` handles readable exports. Raw data selection, backups and manual backup cleanup remain part of sync. See [feature decisions](MAINTENANCE.md#功能取舍与维护边界) for the reasons and maintenance boundaries. This is a selectively maintained fork, not a runtime wrapper or a full replacement of the upstream suite. Daily reviews track published upstream changes, port worthwhile retained behavior, skip removed features and ask the owner through ntfy when uncertain; removed modules are not restored automatically.
