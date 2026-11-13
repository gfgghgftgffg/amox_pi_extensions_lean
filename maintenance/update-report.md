# Restore original SSH Git behavior

Base: 6e5b5f11b92d1292fd124619d779d175043cb07a
Release after verified merge: v0.1.34

<!-- amox-release-summary:v0.1.34:start -->
- 按所有者要求移除 amox-pi-sync 的代理配置、HTTP CONNECT helper、Windows SSH 启动器及相关网络适配，恢复原来的直接 SSH Git 调用。
- GitHub 示例恢复 git@github.com:OWNER/REPO.git；网络和代理由插件外的系统、Git、SSH 配置负责，每日维护不得重新引入这些功能。
- 保留 /delete-session 定向级联删除、默认开启且可关闭的删除确认，以及删除完成后的状态复位；其它包不升版。
<!-- amox-release-summary:v0.1.34:end -->

Source review: [agent-review.md](agent-review.md).

Only `amox-pi-sync@0.1.14` is selected for npm publication. Exact-head three-platform CI and independent Release verification are required before publication.
