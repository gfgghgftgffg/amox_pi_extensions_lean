# pi-goal-x-lean

[English](README.md)

[pi-goal-x](https://github.com/tmonk/pi-goal-x) 的轻量包装，不复制上游引擎。通过 `pi-subagents-lean` 兼容 [@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) 及其 workflow。

## 功能

- 保留上游七个工具、命令、界面、设置及目标文件格式。除任务开关外，激活工具列表固定；草稿提问使用 `goal_questionnaire`，目标模式由用户发起的草稿决定。
- 增加轻量联动层，让目标归父会话管理，并在已追踪的 Agent/workflow 交回结果前阻止自动续跑和完成验收。

## 安装

需要 Pi `>=1.4.0 <2.0.0`、Node `>=22.19.0`。安装时不固定版本：

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi update --extensions
```

单独使用 goal 不要求安装 subagents。联用时再执行 `pi install npm:@gfgghgftgffg/pi-subagents-lean`。每个扩展只保留一个来源，不再单独加载原版 `pi-goal-x`。

从 Git checkout 安装可用 `node scripts/install-extension.mjs pi-goal-x-lean`。

## 使用

```text
/goal 为报表添加 CSV 导出，完成要求包括测试和使用说明
```

确认计划后开始执行。直接创建用 `/goal-direct`，有序步骤用 `/sisyphus`，修订用 `/goal-tweak`，暂停和恢复用 `/goal-pause`、`/goal-resume`。完整命令见[上游文档](https://github.com/tmonk/pi-goal-x#readme)。

遇到不可重试的服务商错误，或用尽配置的网络重试次数后，目标会暂停。修复问题后使用 `/goal-resume [文本]`；附带的文本会发送给 Agent。

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
