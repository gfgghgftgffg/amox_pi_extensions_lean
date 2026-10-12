# Upstream maintenance candidate

<!-- amox-maintenance-adapted; verified -->

Base: 7a666d19d92f6e5d0d22a0b5d638645a079809a3
Release after human merge: v0.1.1

已读取两个升级包的 MAINTENANCE.md、新旧 npm 发布源码与 CHANGELOG，以及本地 lean 入口的初始/最终版本。pi-subagents 0.20.0→0.21.0、todo/i18n 2.13.5→2.13.8 的工具名、参数/required/默认值、执行签名及 facade 依赖的内部边界兼容；两个 index.ts 完全保留。subagents 的 steer 完成通知、前台转后台、文件隔离优先、builtin MCP/trust 与子工具作用域变化由上游依赖承接，已更新两包中英文 README、MAINTENANCE.md 和根 README，并新增三个离线回归测试，所有既有测试与断言保留。详细 revision、API、作者 commit 无变化/无复用拒绝项、文件清单与验证边界已写入 maintenance/agent-review.md。没有改依赖/版本/manifest/lock/快照/CI/配置/许可证，没有复制上游运行时代码。ready 仅表示适配提案可交独立验证，不是测试或发布通过：本阶段未运行 npm ci/check/contracts/contracts:check/生产安装验证或字符统计；旧数字明确标为历史基线，独立任务负责重测同步。rpiv-config 源码未在材料中提供，只核对其直接调用面，未宣称全面审查传递依赖内部行为。真实 provider/MCP/trust/交互 UI 与通知时序端到端未实测，证据边界已记录。web-access 仍为 0.39.0，规划中无变化。合并及发版必须在独立验证通过后交人工确认。

Detailed source/API review: [agent-review.md](agent-review.md).

Lean source changes were reviewed individually, not copied wholesale. Tests, contract capture, standalone production installs and both high-level npm audits must pass before this report is exported. Human diff review is still required.
