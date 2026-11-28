# @gfgghgftgffg/amox-pi-sync

[![npm](https://img.shields.io/npm/v/@gfgghgftgffg/amox-pi-sync?style=flat-square)](https://www.npmjs.com/package/@gfgghgftgffg/amox-pi-sync)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.1.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**Private SSH Git synchronization for Pi agent data — with selectable paths, deletion propagation, targeted session-tree removal, and orphan subagent cleanup.**

[简体中文](README.zh-CN.md)

Synchronizes raw Pi data across machines without registering any model tools, rewriting JSONL history, or merging host-specific configuration files.

## Features

- **Raw, byte-preserving data sync** — Syncs `sessions` and `missions` by default (plus any safe relative agent-data paths you include or exclude). Files move verbatim with no Markdown export or semantic JSONL merge; conflicting edits on both sides stop safely for inspection.
- **Per-device deletion propagation** — Tracks synced files via a local `syncedPaths` baseline so intentional deletions propagate cleanly on push and pull without deleting local-only or unpulled remote files.
- **Targeted `/delete-session` tree removal** — Previews the active session and all recursively linked descendants (including renamed sessions and manual forks), switches to a fresh session, and commits snapshot + local deletion while leaving unrelated orphans untouched.
- **Orphan subagent pruning (`/sync-prune`)** — Detects orphaned `type#8hex` subagent sessions and their descendants when a parent session is gone, previews count and size, and syncs the cleanup (manual by default, optional before push).
- **Minimal-footprint backups & Starline UI** — Pull and restore back up only local files about to be replaced or deleted. Integrates with [Starline](https://github.com/Andy8647/pi-starline) via a clickable status capsule, with full `/sync-*` command parity when Starline is absent.

## Installation

Requires Pi `>=1.1.0`, Node.js `>=22.19.0`, npm, Git, and working SSH authentication.

Install from npm without pinning a version:

```sh
pi install npm:@gfgghgftgffg/amox-pi-sync
pi update --extensions
```

Or install from a local checkout of the monorepo (also useful if initial npm publication is pending):

```sh
node scripts/install-extension.mjs amox-pi-sync
```

> [!IMPORTANT]
> Only this standalone extension is installed — never load it alongside the upstream `pi-sync-suite`. Check `pi list` and remove any old sync source before enabling `amox-pi-sync`.

## Usage

**1. Connect a private SSH Git repository (saves configuration without transferring files yet):**

```text
/sync-setup git@host:owner/private-repo.git
```

For GitHub remotes, use `git@github.com:OWNER/REPO.git`. Network routing, proxies, and SSH keys are handled outside this extension by your OS, Git, and SSH config.

**2. Push local data and pull remote updates:**

```text
/sync-push
/sync-pull
```

**3. Delete the current session and its entire descendant tree:**

```text
/delete-session
```

Requires sync setup and `sessions` in managed paths. Confirmation is enabled by default (toggle **Confirm session deletion** in `/sync-settings` to skip the prompt). Close any other Pi processes using those sessions first: Pi switches to a fresh session, waits for the outgoing runtime to shut down, and commits the snapshot removal locally (published via `/sync-push` in manual/off mode, or by the auto-sync loop). Git history, backups, and `/tmp` files remain untouched. If new descendants appear after scanning, deletion aborts rather than widening the target set.

**4. Preview and prune orphan subagent sessions:**

```text
/sync-prune
/sync-prune --yes
```

**5. Inspect status, settings, and stale locks:**

- `/sync-status` — Opens status details and actions (works with or without [Starline](https://github.com/Andy8647/pi-starline)).
- `/sync-settings` — Configures sync mode, managed paths, pre-push pruning, backups, diagnostics, and cleanup.
- `/sync-unlock` — Safely clears a leftover lock file after forced process termination once the recorded PID is no longer running (write operations in manual, auto, and off modes perform this same check automatically; live or malformed locks are never removed, and age alone never triggers takeover).

## Sync Mechanics and Reliability

- **`syncedPaths` baseline** — Records managed paths present at the last successful push or pull. Push removes baseline paths now missing locally; pull backs up and removes baseline paths deleted remotely while preserving locally deleted baseline paths as pending push removals (preventing a pull-before-push resurrection). Never-synced local files and unpulled remote files are untouched. On first run, the baseline seeds from the intersection of local and snapshot paths without inferring pre-baseline deletions.
- **Session deletion vs. orphan prune** — `/delete-session` follows parent links recursively with no filename pattern or 10-minute age filter, sharing portable case-insensitive basename matching and duplicate-name ambiguity protection with `/sync-prune`; its replacement instance runs deletion before automatic pull, and any failure pauses auto-sync until resolved and reloaded. `/sync-prune` targets `type#8hex` subagent files whose parent is missing, skips active sessions and files modified within the last 10 minutes, refuses dirty snapshot repos, commits snapshot deletion before unlinking local files, and warns without blocking push if optional pre-push pruning fails.
- **Git transport & conflict handling** — Network Git operations time out after 10 minutes; local Git commands time out after 60 seconds (any timed-out or cancelled child process fails even if exit code `0` is reported). Pull fast-forwards when possible or performs a clean three-way merge. Non-fast-forward push rejections fetch, integrate without rebase or force, and retry once.
- **Targeted backups & cross-platform line endings** — Pull and restore back up only local files being overwritten or deleted (additive pulls create no backup; manual **Create backup** still snapshots all managed paths). Windows prefers native OpenSSH (`System32/OpenSSH/ssh.exe`) when available. Git runs with `core.autocrlf=false`, `core.eol=lf`, and local `* -text` attributes without rewriting existing mixed line endings.

## Settings and Starline UI

- **Settings menu** — Exposes **View Status**, **Sync Mode** (`auto`, `manual`, `off`), **Sync Paths** (include/exclude safe relative agent-data paths; excluding a path stops future transfers without deleting existing snapshot copies), **Prune before push** (default Off), **Confirm session deletion** (default On; stored as `confirmSessionDelete` in `amox-pi-sync.json`), **Backups** (create/list/restore), **Diagnostics** (doctor/diff/log), and **Cleanup** (Preview, Run, Delete Selected Backup, Retention).
- **Startup behavior** — `manual` and `off` modes make zero network calls at startup. `auto` computes a local fingerprint, starts timers, and triggers a non-blocking background pull. `/sync-setup` saves config and stops timers; run `/reload` to start `auto` mode.
- **Starline capsule & bubbles** — With [Starline](https://github.com/Andy8647/pi-starline), clicking the status capsule (key `pi-sync`, pill bridge prioritized over legacy `extensionStatuses.commands`; no three-line widget) opens cell-anchored bubbles for status, settings, submenus, and confirmations (`/sync-status` reuses the last clicked anchor or centers before the first click; text prompts still use Pi input dialogs).
- **Theme & formatting** — **Bubble colour** (`bubbleColor` in config) defaults to **Follow pill** (`pill`, falling back to theme `accent` before the first click) or overrides borders and selection with `accent`, `success`, `warning`, or `error` without triggering transfers; hidden when Starline is absent. Rows format as `Label: value` (e.g., `Paths: 2 configured`) with `•` prefixes on bold Starline actions. Active transfers display `Push` / `Pull` alongside the configured mode; once deletion finishes, State returns to `Manual`, `Auto`, or `Off` while completed work appears in `Last action`. RPC and non-Starline hosts receive plain text.

## Data Safety and Scope Boundaries

> [!WARNING]
> Sessions, missions, and custom synced paths can contain credentials, tokens, and private code. Always use a **private SSH Git repository**, audit your included paths, and protect both remote repositories and local backups. Private Git hosting does not encrypt files at rest or scrub secrets.

- **Path & session safety** — Paths resolve relative to Pi's agent-data directory without mutating the current working directory. Concurrent edits across devices are not semantically merged; incoming pulls back up and replace differing files, while active sessions are never overwritten or deleted. Restoring a backup applies only currently managed paths.
- **Backup retention** — Backups live in `amox-pi-sync-backups` under the agent-data directory. **Cleanup** deletes complete backup directories only after manual preview and confirmation (default candidates: older than 180 days or beyond the newest 20 backups) — never automatic, and never touching `sessions` or `missions`.
- **Configuration & migration** — Settings persist in `amox-pi-sync.json`. When absent, legacy `pi-sync-suite.json` is read non-destructively for migration; saving writes `amox-pi-sync.json` and uses an isolated `amox-pi-sync-repo` snapshot directory rather than reusing the legacy repo folder.

## Source and Maintenance Model

`@gfgghgftgffg/amox-pi-sync` is a selectively maintained standalone fork of [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync), based on MIT-licensed `pi-sync-suite@0.1.1` (Copyright © 2026 Murat, source ref `npm:pi-sync-suite@0.1.1`).

Settings merging, Markdown/JSON chat archives, Environment Tools, and Local Packages from the upstream suite are intentionally omitted: machine provisioning belongs in tools like `amox-agent-bootstrap`, and readable exports belong in Pi's native `/export`. Daily maintenance reviews published upstream releases, ports worthwhile fixes within retained boundaries, skips removed modules, and escalates ambiguous tradeoffs via ntfy without restoring omitted features. Full rationale and boundaries are documented in [MAINTENANCE.md](MAINTENANCE.md) (see [feature decisions](MAINTENANCE.md#功能取舍与维护边界)).
