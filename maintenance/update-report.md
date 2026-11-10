# Local upstream maintenance

Base: 091c391518ac10fdff39cbaa3dacb0322b5064b3
Release after verified merge: v0.1.22

<!-- amox-release-summary:v0.1.22:start -->
- 发布 `@gfgghgftgffg/amox-pi-sync@0.1.6`：新增 Prune orphan sessions，按父会话 basename、`type#8hex` 名字和固定点级联识别孤儿子代理会话，跳过最近 10 分钟修改及活跃会话。
- Prune 先预览条数、体积和前几条名称，确认后先提交快照删除，再删本地文件；仓库有暂存或未提交修改时拒绝执行。新增 `/sync-prune [--yes]` 和默认 Off 的 **Prune before push**，三条 Push 路径都会在 Push 前执行，清理失败只警告不阻断。
- 手动删除现在会传播：每台设备用 `syncedPaths` 基线记录已同步路径，Push 删除基线中本地已消失的文件；Pull 应用远端删除并保留本地待传播删除，删除前创建恢复备份。从未同步的本地文件和尚未 Pull 的远端文件不会被误删。
- 升级前已经发生的删除不做自动推断，避免把“远端有、本机还没 Pull”的文件当成删除；孤儿会话可用 Prune 处理，之后的手动删除会自动传播。
- 本批仅发布 sync，其它三个 npm 包不升版、不重新发布。
<!-- amox-release-summary:v0.1.22:end -->

Source review: [agent-review.md](agent-review.md).

Local scoped checks, the full repository suite, exact-head three-platform CI and independent merged-SHA Release verification are required. npm publication is confirmed only by the actual publishing job and public registry integrity.
