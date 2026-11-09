# Local upstream maintenance

Base: 3261d956499073196a22a725d0638e7c0b1f571f
Release after verified merge: v0.1.17

<!-- amox-release-summary:v0.1.17:start -->
- 首次发布独立扩展 `@gfgghgftgffg/amox-pi-sync@0.1.1`：私有 SSH Git 原始 agent 数据同步、备份恢复、诊断和手动备份清理；保留 Starline 状态胶囊和统一操作界面，不安装原版 suite。
- 每日监控 sync 的上游正式发布，校验前后归档 integrity，并按既定功能取舍逐项审查。保留范围内值得跟进的改动才定向移植；舍弃功能跳过，不恢复完整 suite、不添加上游运行时依赖。
- 无法确定的功能、行为或兼容性改动通过 ntfy 通知所有者，附版本、理由和文件。审查阶段的待决定项不阻塞其它包；移植中发现疑问则保留暂停当前候选，阻止后续自动推送／合并。
- 相同目标和规则复用已记录的 skip/ask 审查，避免重复调用模型。自动适配不能改写功能取舍章节，且必须有实际源码改动和定向回归才能发布移植版本。
- 本批只发布 sync；web、todo 和 subagents 维持原版本。共享维护流程改动扩大验收范围，不扩大 npm 发布选择。
<!-- amox-release-summary:v0.1.17:end -->

Source review: [agent-review.md](agent-review.md).

Local validation includes typechecks, regression tests, contract verification, independent production installs and dependency audits. Exact-head three-platform PR CI and independent merged-SHA Release acceptance remain required; this report does not substitute for their actual results. GitHub Release creation alone does not prove first npm publication or Trusted Publisher setup has succeeded.
