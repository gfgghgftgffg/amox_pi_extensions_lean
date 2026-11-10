# MAINTENANCE — amox-pi-sync

## Source and attribution

- Upstream: [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync), npm `pi-sync-suite@0.1.1`.
- Source ref: `npm:pi-sync-suite@0.1.1` (published source baseline, not the repository's moving HEAD).
- Upstream MIT notice is preserved verbatim in `LICENSE`: Copyright (c) 2026 Murat.
- Local package: `@gfgghgftgffg/amox-pi-sync@0.1.6`, standalone TypeScript entrypoint `index.ts` and `core.ts`; no runtime dependency on the original suite.

## Scope

Keep raw agent-data push/pull, safe relative include/exclude paths (sessions + missions by default), manual/background automatic sync, deletion propagation from a per-device `syncedPaths` baseline, orphan subagent pruning, backups/restoration and diagnostics. No configuration sync/settings merging, Markdown/JSON exports, Environment Tools or Local Packages. Cleanup is retained only for manually deleting local backup directories (Preview, Run, Delete Selected Backup, Retention); never sessions/missions, with no automatic deletion or archive restoration. Default cleanup candidates are complete backups older than 180 days or beyond the newest 20; counting individual files is not the retention unit. No three-line widget: optional Starline capsule/details, with `/sync-status` fallback.

Settings are stored in `amox-pi-sync.json`; legacy `pi-sync-suite.json` is read only as a migration fallback until new settings are saved. Backups use `amox-pi-sync-backups` and require manual retention management via Cleanup. Manual/off startup must not access the network; auto startup fingerprints locally then starts timers and a non-awaited background pull. Setup only saves configuration and stops timers, requiring reload to activate auto mode. The automatic loop must not block the UI. Migration uses an independent `amox-pi-sync-repo`, not the old snapshot directory. The `pi-sync` status key preserves existing Starline placement; the pill bridge takes priority over legacy command mapping. `off` disables automation, not explicit commands. Presentation separates labels and values with a colon; the path count is explicitly marked configured. Starline action rows have a leading bullet, while native Pi selectors retain their own indicators. Presentation uses semantic Pi theme colours for labels, values and errors, and bold targets without fixed foreground/background colours so Starline owns selection contrast. Keep Manual/Auto/Off and Push/Pull terminology consistent across capsule, details, menus and command feedback; never append idle to the mode. Anchor bubbles to the clicked Starline cell, including submenus and confirmations; commands reuse the last clicked anchor or center before one is known. Forward pill colours by default and offer semantic theme colour overrides through bubbleColor; do not override selected-row text contrast. Colour changes must not start timers or network work. Without Starline use native Pi UI and hide the Starline colour option. Recompute theme styles when rendering, keep RPC/native status text plain, and do not store styled strings in settings. On Windows prefer native OpenSSH when present for non-ASCII home paths; retain batch mode, timeout and host-key verification. Keep large diagnostic results in the action notification rather than copying JSON dumps into status details.

Safety requirements: private SSH remote, no working-directory mutation, no semantic JSONL merging, preserve files that were never synced, back up replacements/deletions and never overwrite or delete active sessions. Deletion propagation must use `syncedPaths`: Push removes only previously synced paths missing locally, Pull removes only baseline paths absent from the new snapshot, and Pull preserves locally missing baseline paths as pending push deletions. Pre-upgrade deletions are not inferred automatically. Prune orphan sessions scans `sessions/**/*.jsonl`, compares parent basenames case-insensitively, accepts `type#8hex` names, iterates parent candidates to a fixed point, skips files modified within 10 minutes and the active session, refuses dirty repositories, commits snapshot removals before deleting local files, and never deletes symlinks or non-files. Before-push pruning runs outside `run("Push")`, is Off by default, and never blocks a push on failure. Network transfers use a 10-minute timeout and local Git commands 60 seconds; a terminated or timed-out process must never be recorded as success, even when an executor reports code 0. Pull fast-forwards or performs a clean file-level three-way merge; conflicts abort and apply nothing. A rejected non-fast-forward push fetches, integrates without rebase or force, and retries once; files integrated during push are applied on the next pull. Git commands force `core.autocrlf=false` and `core.eol=lf`, with a repository-local `* -text` attribute; do not rewrite raw bytes or existing mixed-EOL history automatically. Safe-path validation must exclude configuration and implementation data even when users select arbitrary relative data paths. Do not claim encryption, conflict-free multi-device merging or automatic secret removal.

## 功能取舍与维护边界

本 fork 负责原始 agent 数据的跨设备传输和本地恢复。部署、配置模板与机器路径适配由 `amox-agent-bootstrap` 等部署流程负责；阅读版会话导出使用 Pi 原生 `/export`。使用本扩展不要求安装 bootstrap。

| 上游功能 | 处理 | 原因 |
| --- | --- | --- |
| 配置同步、settings 合并 | 删除 | 避免本机同步快照与部署模板成为两个配置来源，也不将机器专属设置直接应用到另一台电脑。通用路径选择仍可传输用户明确选中的安全数据文件，但不提供配置合并或路径适配。 |
| Markdown/JSON 聊天归档 | 删除 | 本扩展的目标是保留可继续工作的原始会话；上游导出会省略、截断内容，不能代替原始数据。阅读和分享交给 Pi 原生导出，不在同步器内维护另一套渲染器。 |
| Environment Tools | 删除 | 工具安装和依赖适配归部署流程管理，数据拉取不应同时承担环境安装职责。 |
| Local Packages | 删除 | 它控制 settings 中本地扩展路径的同步；配置同步移除后不再需要，而且传输路径字符串不会安装路径所指向的代码。 |
| sessions、missions | 保留 | sessions 保存对话与工具记录；missions 保存工作流任务及关联索引。两者共同保留工作记录，但不保证恢复运行中的任务或临时目录中的外部产物。 |
| 通用路径选择 | 保留 | 允许用户按需要包含、排除安全的 agent 数据路径，不将范围写死为两个目录；敏感文件与实现目录仍受限制。 |
| 手动、自动同步 | 保留 | 支持用户主动换机时推拉，也保留可选后台同步；默认手动，不因精简功能改变用户的同步时机。 |
| 删除传播、孤儿会话清理 | 新增 | 手动删除的会话需要从远端和快照中移除，否则下次 Pull 会恢复；用 `syncedPaths` 基线只传播本机曾同步过的删除。Prune 依据父子会话关系清理孤儿子代理，并同步删除快照副本。 |
| 备份恢复 | 保留 | 同路径文件可能被远端内容替换，覆盖前的本地副本是恢复入口。 |
| Cleanup | 保留并修正 | 即使没有聊天归档，备份仍会积累，需要界面内的手动管理。按完整恢复点预览和确认删除，修正上游保留数量逻辑；不清理 sessions、missions，也不自动删除。 |
| 诊断 | 保留 | 用户需要查看待传输差异、Git 状态和错误，不能将失败或“未检查”显示为已同步。 |
| 常驻三行 widget | 替换 | 将状态、操作与设置统一到 Starline 气泡，避免常驻重复信息；未安装 Starline 时保留原生命令界面。 |

精简目标是职责清晰和减少维护范围，未进行启动性能对比。每日监控上游正式发布，保持上述边界定向移植；新增功能应有明确需求，不随上游更新自动恢复已移除模块。

## Repository integration

`maintenance/manifest.json` marks this package `maintenanceMode: selective-fork`. Daily maintenance monitors the latest stable npm publication, not unpublished moving repository HEAD. It compares the exact published baseline and target archives, verifies their SHA-512 integrity, and reads source as untrusted text without installing or executing the original suite. A separate read-only SDK review must cover every changed published file and apply the feature decisions above:

- **Port** worthwhile fixes and improvements within retained behavior, especially data/path safety, backups, diagnostics, background responsiveness and compatibility with the existing Starline UI. Preserve local guarantees; add focused regressions.
- **Skip** changes only to removed features or irrelevant material. Already-implemented behavior may be skipped only with a concrete source-based explanation. Record the decision; do not bump the package or move the integrated upstream baseline.
- **Ask** the owner about new features, conflicting goals, unclear value, behavior/safety tradeoffs, compatibility uncertainty or incomplete source/review evidence. Any unresolved item pauses the whole sync port, not other packages. ntfy includes the upstream version delta, reasons and files. Do not call an uncertain change irrelevant to bypass review.

Only a complete review with ports and no unresolved items enables adaptation of `index.ts`/`core.ts` and its scoped tests/docs. The owner’s feature-decisions section is immutable during automatic adaptation. An actual implementation change and focused regression are required; version-only or docs-only ports cannot be published. If implementation reveals new uncertainty, `ask_owner` records the reason, sends ntfy and pauses the existing candidate without further push or merge; it must not bypass a failed check by rebuilding. The fixed host independently stages its package version and publication baseline; local checks, exact-head three-platform CI and Release acceptance still apply. No upstream runtime dependency is added. **Never replace this fork with the full suite or reintroduce removed features.** Tool-context measurements still skip this command-only package.

Skip/ask reports are saved privately under the host maintenance state directory as `fork-review-amox-pi-sync.json`, including the baseline/target, integrity and per-change evidence. The same version and unchanged local implementation/policy reuse the report without another model call; pending owner decisions remain visible in daily ntfy summaries. Source acquisition failures are rechecked. A new target or changed local policy/implementation triggers review again, always against the last integrated baseline so skipped changes cannot hide later relevant fixes. Port decisions are not cached as successful integration. To resolve a pending decision, record the owner's rule in this file and merge it, then rerun maintenance; do not edit a report to fake an approved release.

All workspace packages retain their own versions; the root version identifies a release batch and its explicit package selection. This package also records `releaseVersioning: independent`. Release assets use each manifest/package version in the tarball name; the GitHub release tag remains tied to the root version. Installation and production checks still include this package. `toolContract: false` excludes this command-only fork from upstream-versus-lean tool-size comparisons; `registeredTools: []` is checked during isolated production loading.

来源记录不代表当前 CI/发布结果或现行审批要求。更新前应对比 manifest 中当前固定版本/revision 与目标源码。

## Verification before an update

1. Read the exact published upstream source and its MIT notice, compare only relevant sync behavior, and record the reviewed ref. Do not use repository HEAD as the publication baseline.
2. Update local implementation and focused regressions without weakening active-session, path, backup or migration guarantees. Keep UI tests isolated from user Pi settings; use temporary data directories and local Git fixtures rather than real remotes.
3. Run `npm run check --workspace @gfgghgftgffg/amox-pi-sync`, repository integration tests, `npm run contracts:check` and `npm run verify:production`.
4. Keep package version, manifest version, lockfile and bilingual documentation consistent. Do not publish, change real Pi settings or commit as part of verification.
