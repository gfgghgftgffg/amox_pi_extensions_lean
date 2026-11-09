# Local upstream maintenance

Base: 7634ef54e5148a82b560c5d6477fac26211ec52d
Release after verified merge: v0.1.19

<!-- amox-release-summary:v0.1.19:start -->
- 发布 `@gfgghgftgffg/amox-pi-sync@0.1.3`：Windows 优先使用原生 OpenSSH，修复 Git for Windows SSH 无法读取中文用户目录的问题；保留非交互模式、连接超时与主机密钥验证。
- Sync 气泡像 Model 一样锚定对应 Starline cell，状态、设置、子菜单及确认框沿用点击锚点和胶囊颜色，不再强制居中。
- 新增 Bubble colour 设置：默认 Follow pill，也可选择主题 accent、success、warning 或 error；配色保存为语义值，修改配色不触发网络传输。
- 未安装 Starline 时隐藏专用配色选项，继续使用 Pi 原生界面；RPC 保持纯文本。同步路径、备份恢复、手动清理及自动同步策略不变。
- 本批仅发布 sync，其它三个 npm 包不升版、不重新发布。
<!-- amox-release-summary:v0.1.19:end -->

Source review: [agent-review.md](agent-review.md).

Direct commands use the last clicked cell, or a centered fallback before the first click. Local scoped checks, exact-head three-platform CI and independent merged-SHA Release verification are required. npm publication is confirmed only by the actual publishing job and public registry integrity.
