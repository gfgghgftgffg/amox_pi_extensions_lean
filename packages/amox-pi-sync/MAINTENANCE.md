# MAINTENANCE — amox-pi-sync

## Source and attribution

- Upstream: [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync), npm `pi-sync-suite@0.1.1`.
- Source ref: `npm:pi-sync-suite@0.1.1` (published source baseline, not the repository's moving HEAD).
- Upstream MIT notice is preserved verbatim in `LICENSE`: Copyright (c) 2026 Murat.
- Local package: `@gfgghgftgffg/amox-pi-sync@0.1.0`, standalone TypeScript entrypoint `index.ts` and `core.ts`; no runtime dependency on the original suite.

## Scope

Keep raw agent-data push/pull, safe relative include/exclude paths (sessions + missions by default), manual/background automatic sync, backups/restoration and diagnostics. No configuration sync/settings merging, Markdown/JSON exports, Environment Tools or Local Packages. Cleanup is retained only for manually deleting local backup directories (Preview, Run, Delete Selected Backup, Retention); never sessions/missions, with no automatic deletion or archive restoration. Default cleanup candidates are complete backups older than 180 days or beyond the newest 20; counting individual files is not the retention unit. No three-line widget: optional Starline capsule/details, with `/sync-status` fallback.

Settings are stored in `amox-pi-sync.json`; legacy `pi-sync-suite.json` is read only as a migration fallback until new settings are saved. Backups use `amox-pi-sync-backups` and require manual retention management via Cleanup. Manual/off startup must not access the network; auto startup fingerprints locally then starts timers and a non-awaited background pull. Setup only saves configuration and stops timers, requiring reload to activate auto mode. The automatic loop must not block the UI. Migration uses an independent `amox-pi-sync-repo`, not the old snapshot directory. The `pi-sync` status key preserves existing Starline placement; the pill bridge takes priority over legacy command mapping. `off` disables automation, not explicit commands.

Safety requirements: private SSH remote, no working-directory mutation, no JSONL merging, preserve local-only files, back up replacements and never overwrite active sessions. Safe-path validation must exclude configuration and implementation data even when users select arbitrary relative data paths. Do not claim encryption, conflict-free multi-device merging or automatic secret removal.

## Repository integration

`maintenance/manifest.json` marks this package `maintenanceMode: manual-fork`. Automated npm/Git upstream discovery, source collection, adapter writes, version staging and context-footprint measurements skip it. **Never replace it with the full upstream suite or reintroduce removed features during automatic maintenance.** Upstream changes require manual source review and scoped porting.

All workspace packages retain their own versions; the root version identifies a release batch and its explicit package selection. This package also records `releaseVersioning: independent`. Release assets use each manifest/package version in the tarball name; the GitHub release tag remains tied to the root version. Installation and production checks still include this package. `toolContract: false` excludes this command-only fork from upstream-versus-lean tool-size comparisons; `registeredTools: []` is checked during isolated production loading.

来源记录不代表当前 CI/发布结果或现行审批要求。更新前应对比 manifest 中当前固定版本/revision 与目标源码。

## Verification before an update

1. Read the exact published upstream source and its MIT notice, compare only relevant sync behavior, and record the reviewed ref. Do not use repository HEAD as the publication baseline.
2. Update local implementation and focused regressions without weakening active-session, path, backup or migration guarantees. Keep UI tests isolated from user Pi settings; use temporary data directories and local Git fixtures rather than real remotes.
3. Run `npm run check --workspace @gfgghgftgffg/amox-pi-sync`, repository integration tests, `npm run contracts:check` and `npm run verify:production`.
4. Keep package version, manifest version, lockfile and bilingual documentation consistent. Do not publish, change real Pi settings or commit as part of verification.
