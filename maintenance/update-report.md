# Local upstream maintenance

Base: 794d47b1d651b3470f6320cde2821fd6de4827f1
Release after verified merge: v0.1.18

<!-- amox-release-summary:v0.1.18:start -->
- 发布 `@gfgghgftgffg/amox-pi-sync@0.1.2`：状态和设置界面按 Pi 主题区分标签、数值、状态、异常和待处理变化，可选操作加粗、分组，并保留 Starline 的选中对比度。
- 统一胶囊、详情、菜单和命令反馈中的 Manual / Auto / Off、Push / Pull 文案，去掉 idle 括号与 Upload / Download；Objects 改为 Paths，相关时间标签同步整理。
- 设置菜单使用稳定操作标识，标出当前模式；清理与备份提示分离为简短标题和说明，保留全部确认与数据安全边界。窄屏快捷键提示保持单行。
- 大段诊断结果仍可查看，但不再作为 JSON 塞进状态面板；终端控制序列不会污染正文样式。无 Starline 或 RPC 时保留纯文本和原生选择界面。
- 同步传输、路径范围、备份恢复、手动清理、自动模式与 pre-push fingerprint 行为保持不变。本批只发布 sync，其它三个 npm 包不升版、不重新发布。
<!-- amox-release-summary:v0.1.18:end -->

Source review: [agent-review.md](agent-review.md).

The UI candidate passed the full local suite before release staging, plus actual installed Starline dark/light render checks across narrow and wide layouts and selected/unselected states. Release staging is independently validated against the exact base and selected package. Exact-head three-platform CI and independent merged-SHA Release acceptance remain required; this report is not an attestation of jobs that have not yet completed.
