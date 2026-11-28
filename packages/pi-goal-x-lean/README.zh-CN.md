# pi-goal-x-lean

[English](README.md)

[pi-goal-x](https://github.com/tmonk/pi-goal-x) 的轻量包装，不复制上游引擎。通过 `pi-subagents-lean` 兼容 [@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) 及其 workflow。

## 功能

- 保留上游七项操作、命令、界面、设置及目标文件格式。Pi 1.7+ 只向模型声明可直接调用的 `get_goal` 和一个 `goal` 调度工具；旧版 Pi 仍保留七个精简后的直接工具。除任务开关外，激活工具列表固定；草稿提问使用 `goal_questionnaire`，目标模式由用户发起的草稿决定。
- 关闭任务跟踪时，任务操作不再路由或展示，起草指引要求省略 tasks。
- 增加轻量联动层，让目标归父会话管理，并在已追踪的 Agent/workflow 交回结果前阻止自动续跑和完成验收。

## 安装

需要 Pi `>=1.4.0 <2.0.0`、Node `>=22.19.0`。安装时不固定版本：

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi update --extensions
```

单独使用 goal 不要求安装 subagents。联用时再执行 `pi install npm:@gfgghgftgffg/pi-subagents-lean`。每个扩展只保留一个来源，不再单独加载原版 `pi-goal-x`。子会话只过滤继承的目标上下文，不安装目标工具或路由。

从 Git checkout 安装可用 `node scripts/install-extension.mjs pi-goal-x-lean`。

## 使用

```text
/goal 为报表添加 CSV 导出，完成要求包括测试和使用说明
```

确认计划后开始执行。直接创建用 `/goal-direct`，有序步骤用 `/sisyphus`，修订用 `/goal-tweak`，暂停和恢复用 `/goal-pause`、`/goal-resume`。完整命令见[上游文档](https://github.com/tmonk/pi-goal-x#readme)。

Pi 1.7+ 直接用 `get_goal` 读取状态。调用 `goal` 时，`op` 填操作名，`input` 填 JSON 字符串；`goal({"op":"help","input":"update_goal_task"})` 展开单项帮助。任务清单确认会结束当前回合，确认后继续。旧版 Pi 使用原生的七个工具名。

遇到不可重试的服务商错误，或用尽配置的网络重试次数后，目标会暂停。修复问题后使用 `/goal-resume [文本]`；附带的文本会发送给 Agent。

要与 Agent 一起修订目标，请使用 `/goal-tweak`。在外部编辑目标文件后，可用 `/goal-refresh` 重新扫描文件并更新当前目标；普通读取仍可能使用缓存快照。

Pi 1.7 普通对话首轮启用 Goal 时，请求体增加 196 token，安装基线为 1248。计量使用 `gpt-4o` 分词器。起草和执行时按阶段追加提示。逐主题帮助及读取、任务、起草的总量见[测量说明](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/goal-tools-design.zh-CN.md)。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-goal-x-lean | 1297 |
| pi-goal-x | 1691 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 维护

联动范围、并发限制、副作用及升级验证见 [MAINTENANCE.md](MAINTENANCE.md)。
