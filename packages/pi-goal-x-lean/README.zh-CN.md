# pi-goal-x-lean

[English](README.md)

[pi-goal-x](https://github.com/tmonk/pi-goal-x) 的轻量包装：保留持久目标、自动续跑和完成审计，精简工具文案，不复制上游引擎。

## 功能

- 保留上游工具、命令、界面、设置及目标文件格式。
- 与 `pi-subagents-lean` 联用时自动识别子会话，由父 Agent 管理目标，无需逐个角色配置。
- goal 执行期间，通过 `subagent` 启动的后台 Agent/workflow 未交回结果时，阻止自动续跑或完成验收。

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

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-goal-x-lean | 1535 |
| pi-goal-x | 2096 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 维护

联动范围、并发限制、副作用及升级验证见 [MAINTENANCE.md](MAINTENANCE.md)。
