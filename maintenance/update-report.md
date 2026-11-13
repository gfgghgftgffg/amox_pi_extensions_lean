# Sync preferences, status and SSH proxy release

Base: 508f4413e0fc984efbe2a676510b362adce0d370
Release after verified merge: v0.1.32

<!-- amox-release-summary:v0.1.32:start -->
- amox-pi-sync 增加 Confirm session deletion 设置，默认开启，可关闭 `/delete-session` 确认框；切换偏好只保存配置，不触发同步。
- 修复复用扩展实例时 Delete session 忙状态残留，删除后恢复 Manual/Auto/Off，保留真正进行中的 Push/Pull 状态。
- 配置文件新增 `proxy`，支持通过 `http://127.0.0.1:7897` 这类 HTTP CONNECT 代理传输 SSH Git；不改全局设置，不依赖 nc/curl，也不在代理失败时静默直连。
- 打包、发布及每日维护纳入 SSH 代理 helper；更换仓库配置时保留代理和删除确认偏好。
<!-- amox-release-summary:v0.1.32:end -->

Source review: [agent-review.md](agent-review.md).

Only `amox-pi-sync@0.1.12` is selected for npm publication. Three-platform PR CI and independent Release verification remain required; this report is not an attestation that those checks have completed.
