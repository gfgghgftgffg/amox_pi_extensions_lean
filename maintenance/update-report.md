# Local upstream maintenance

Base: 4cc4cc7b421c667a470c189ad5bd4dc627d22ede
Release after verified merge: v0.1.20

<!-- amox-release-summary:v0.1.20:start -->
- 发布 `@gfgghgftgffg/amox-pi-sync@0.1.4`：状态和设置中的标签与值统一使用冒号分隔。
- 设置菜单明确显示 `Mode: Manual`、`Paths: 2 configured`、`Bubble colour: Follow pill`，路径数字表示已配置的同步路径数。
- Starline 中所有可选操作统一以 `•` 开头，区分操作项与信息行；原生 Pi 选择器保留自带的选择标记。
- 仅修改界面文本，不改变同步、配色或弹框锚点行为。其它三个 npm 包不升版、不重新发布。
<!-- amox-release-summary:v0.1.20:end -->

Source review: [agent-review.md](agent-review.md).

Local tests were skipped at the owner's request. Existing exact-head three-platform CI and independent merged-SHA Release verification remain required.
