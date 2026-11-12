# Goal integration release

Base: a21bb31906e71d2927f2597ceb2bd0a8d92672aa
Release after verified merge: v0.1.28

<!-- amox-release-summary:v0.1.28:start -->
- 新增 `pi-goal-x-lean`：使用完整上游运行时，保留八个目标工具、命令、持久化和完成审计，仅精简工具元数据。
- `pi-subagents-lean` 提供只读子会话接口，使目标管理留在父 Agent；无需逐个角色排除 goal，也不自动启用 Task Router。
- goal 在已追踪的后台 Agent/workflow 交回结果前阻止自动续跑和完成；修复旧结果／通知错误解除新 resume 等待的并发问题。联动边界和副作用见各包 MAINTENANCE.md。
- 每日维护新增精确 npm 源码与 SHA-512 审查；更新 goal 或 subagents 任一方均联合验收，未改包不陪跑发布。README 保持简短介绍。
- 本批只选择 `pi-goal-x-lean@0.1.0` 和 `pi-subagents-lean@0.1.19`。goal 首次 npm 发布需要维护者完成交互式授权；GitHub Release 附件不代表 npm 已上架。
<!-- amox-release-summary:v0.1.28:end -->

Source review: [agent-review.md](agent-review.md).

本地检查、精确 head 三平台 CI 与 Release 对合并 SHA 的独立验收分别执行；实际结果以对应检查和发布 job 为准。依赖审计的上游漏洞按策略记录为警告。
