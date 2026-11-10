# Local upstream maintenance

Base: 37d1061b9a951313b9cd28a8eec4380c84ac26ec
Release after verified merge: v0.1.25

<!-- amox-release-summary:v0.1.25:start -->
- 发布 `@gfgghgftgffg/amox-pi-sync@0.1.9`：气泡中的长文件列表只显示前 3 个路径加 `(+N more)`，并限制单行显示长度为 160 字符。
- 即使一次同步产生大量文件变化，Check status / Push / Pull / Prune / Settings 等操作项也不会被挤出可见区域；完整结果仍保留在操作通知中。
- 本批只包含这一处显示修复；Prune、删除传播、超时/分叉处理和局部备份沿用当前实现。其它三个 npm 包不升版、不重新发布。
<!-- amox-release-summary:v0.1.25:end -->

Source review: [agent-review.md](agent-review.md).

Local scoped checks, the full repository suite, exact-head three-platform CI and independent merged-SHA Release verification are required. npm publication is confirmed only by the actual publishing job and public registry integrity.
