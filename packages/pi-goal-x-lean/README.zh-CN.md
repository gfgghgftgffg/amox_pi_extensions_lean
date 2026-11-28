# @gfgghgftgffg/pi-goal-x-lean

[English](README.md)

## 优点

为 [`pi-goal-x`](https://github.com/tmonk/pi-goal-x) 提供更轻量的封装。目标创建、任务、问卷、审计和全部命令都保留；Pi 1.7 首轮只带 `get_goal` 和 `goal` 两个工具，模型可见的工具注册文本约 188 字符代理，比上游的 1691 少约 89%。

## 功能

- `create_goal`、`get_goal`、`update_goal`、`set_goal_tasks`、`update_goal_task`、`goal_questionnaire` 和 `propose_goal_draft` 七项操作仍走上游，参数校验、确认、审计、命令、界面、设置和目标文件格式不变。
- `get_goal` 可直接读取状态；其余操作由 `goal` 调度，`op` 填操作名，`input` 填 JSON 对象字符串。`goal` 的 `help` 按操作展开参数和示例。六个路由操作仍激活，只是不发给模型。
- 关闭任务跟踪时，`set_goal_tasks` 和 `update_goal_task` 不再路由或展示，起草提示要求省略 tasks。
- 起草、执行和暂停阶段按需追加提示；暂停目标只提示读取和生命周期操作。
- 微调 `pi-goal-x-lean` 与 `pi-subagents-lean` 以互相适配：子会话只过滤继承的目标上下文，不安装目标工具、命令或调度器；活动目标下启动的后台 Agent/workflow 交回结果前，阻止自动续跑和完成验收。

## 来源

本包是本仓库对 [`pi-goal-x`](https://github.com/tmonk/pi-goal-x) 的原始门面，不复制引擎。上游引擎是 tmonk/pi-goal-x，两者都是 MIT。它属于 [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md)。

## 使用方法

### 启动目标

```text
/goal 为报表添加 CSV 导出，完成要求包括测试和使用说明
```

确认计划后开始执行。`/goal-direct` 直接创建，`/sisyphus` 起草有序目标，`/sisyphus-direct` 直接创建有序目标；`/goal-tweak` 修订目标或预算，`/goal-pause` 和 `/goal-resume` 暂停或继续。

### 工具调用

读取状态：

```json
{ "op": "get_goal", "input": "{\"section\":\"tasks\"}" }
```

`get_goal` 也可直接调用。更新目标：

```json
{ "op": "update_goal", "input": "{\"status\":\"paused\",\"reason\":\"等待决定\"}" }
```

查看某个操作的全部参数：

```json
{ "op": "help", "input": "update_goal_task" }
```

`op` 是操作名，`input` 是 JSON 对象字符串。未知操作、非法 JSON 和非对象输入按错误返回。

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `/goal [目标]` | 起草目标，确认后开始 |
| `/goal-direct <目标>` | 立即创建目标 |
| `/sisyphus [目标]` | 起草带逐步验收标准的有序目标 |
| `/goal-tweak <修改>` | 修订目标或 token 预算 |
| `/goal-pause` / `/goal-resume [文本]` | 暂停 / 继续 |
| `/goal-status [verbose\|health]` | 只读面板，可查存储和运行时 |
| `/goal-refresh` | 重新读取目标文件、设置和账本 |
| `/goal-settings` | 目标设置和控件 |

其余命令（`/goal-list`、`/goal-focus`、`/goal-unfocus`、`/goal-clear`、`/goal-cancel`、`/goal-recovery`）见[上游文档](https://github.com/tmonk/pi-goal-x#readme)。

## 安装

需要 Pi 1.7.0 或更新版本。这是公开的 npm 包，安装时不固定版本：

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi update --extensions
```

需要 subagents 联动时，再安装或更新 [`pi-subagents-lean`](../pi-subagents-lean/README.zh-CN.md)：

```bash
pi install npm:@gfgghgftgffg/pi-subagents-lean
```

需要 Git 回退安装时，在仓库 checkout 根目录执行：

```bash
node scripts/install-extension.mjs pi-goal-x-lean
```

本地 Git 安装通过拉取 checkout 并重跑安装脚本更新，`pi update` 不更新本地内容。只保留一种安装来源。迁移时先备份 settings，移除 `pi list` 显示的精确旧来源，再安装 npm 来源。请勿同时加载原版 `pi-goal-x` 或其它 goal 包装扩展。

## 配置与限制

- 在 Pi 之外编辑目标文件后，用 `/goal-refresh` 重新扫描；普通读取仍可能使用缓存快照。
- 不可重试的服务商错误或用尽网络重试后，目标会暂停；修复后用 `/goal-resume [文本]`。
- 目标任务是目标记录中的持久里程碑，与独立的 `todo` 列表不同步。
- subagents 联动只追踪活动目标下通过 `subagent`、`Agent` 和 `SubagentWorkflow` 启动的工作。结果读取与 Agent `resume` 不要放在同一批调用；挂起覆盖整个父会话，没有超时或恢复调度，重载后不保留。CLI workflow、mention、外部 RPC 和目标激活前启动的工作不在追踪范围。

## 模型可见工具文本（字符代理）

<!-- amox-measurement:start -->
| 包 | 模型可见工具（字符代理） |
| --- | ---: |
| @gfgghgftgffg/pi-goal-x-lean | 188 |
| pi-goal-x | 1691 |

只统计发给模型的工具声明；固定按 `ceil(字符数 / 4)` 估算，不是服务商计费 token。
<!-- amox-measurement:end -->

## 开发

[开发检查与维护策略](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)；适配细节见 [MAINTENANCE.md](MAINTENANCE.md)。
