# Session-tree deletion release

Base: 8d5d050ec65959c188feb64eb1d364179933af57
Release after verified merge: v0.1.31

<!-- amox-release-summary:v0.1.31:start -->
- amox-pi-sync 新增 `/delete-session`：预览当前会话及递归后代，确认后先切换新会话、等待旧 runtime 关闭，再删除本地记录并提交快照删除。
- 定向删除包含最近修改、改名和手动 fork 的后代，不受十分钟限制，不清理无关孤儿或 `/tmp`；保留 `/sync-prune` 原有保守规则。
- 协调会话切换与自动同步，防止新实例在删除前 Pull；沿用既有自动模式发布删除，manual/off 仍需手动 Push。每日维护规则保留本地删除语义和回归。
<!-- amox-release-summary:v0.1.31:end -->

Source review: [agent-review.md](agent-review.md).

Only `amox-pi-sync@0.1.11` is selected for npm publication. Three-platform PR CI and independent Release verification remain required; this report is not an attestation that those checks have completed.
