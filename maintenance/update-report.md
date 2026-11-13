# SSH proxy empty-tunnel diagnostics

Base: 277732a1286beb1d9cce45f804853c6fbeab2d28
Release after verified merge: v0.1.33

<!-- amox-release-summary:v0.1.33:start -->
- 修复 HTTP CONNECT 返回 200 后未收到任何 SSH 数据便断开时，代理 helper 错误返回成功的问题；现在返回失败并明确报出目标地址及路由检查提示。
- 对 github.com:22 的空隧道提示显式使用 ssh://git@ssh.github.com:443/OWNER/REPO.git；中英文文档补充配置与主机密钥核对要求，不自动改目标、不静默直连。
- 新增空隧道、GitHub 专用提示及真实 helper 进程退出码回归，保留已有二进制传输和合并 SSH banner 的测试。
<!-- amox-release-summary:v0.1.33:end -->

Source review: [agent-review.md](agent-review.md).

Only `amox-pi-sync@0.1.13` is selected for npm publication. Three-platform PR CI and independent Release verification remain required; this report is not an attestation that those checks have completed.
