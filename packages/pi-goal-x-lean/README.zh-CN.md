# @gfgghgftgffg/pi-goal-x-lean

[![npm](https://img.shields.io/npm/v/@gfgghgftgffg/pi-goal-x-lean?style=flat-square)](https://www.npmjs.com/package/@gfgghgftgffg/pi-goal-x-lean)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.7.0%20%3C2.0.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**面向 [`pi-goal-x`](https://github.com/tmonk/pi-goal-x) 的按需展开轻量门面——Pi 1.7 首轮模型可见工具声明仅约 188 字符代理（较上游 1691 减少约 89%）。**

[English](README.md)

完整保留 `pi-goal-x` 的目标起草、里程碑拆解、交互问卷、完成审计与全部 `/goal*` 命令；在父会话首轮仅向模型暴露只读 `get_goal` 与统一调度器 `goal`，其余细节按需展开。

## 核心特性

- **双工具极简暴露面** — `get_goal` 支持直接读取状态；上游全部七项操作（`create_goal`、`get_goal`、`update_goal`、`set_goal_tasks`、`update_goal_task`、`goal_questionnaire`、`propose_goal_draft`）均保持激活并由 `goal`（`op` + JSON `input`）路由执行，调用 `op: "help"` 即可展开单操作的参数与调用示例。
- **分阶段最小提示** — 按起草、活跃执行、暂停三种阶段精准注入所需提示（暂停状态下仅提示状态读取与生命周期操作）；关闭任务跟踪时自动隐藏并拒接 `set_goal_tasks` 与 `update_goal_task`，起草提示同步省略任务项。
- **完整保留上游能力** — 参数校验、用户确认、完成审计、终端弹窗、设置项及磁盘目标文件格式均原样复用上游引擎。
- **Subagents 深度协同** — 搭配 [`pi-subagents-lean`](../pi-subagents-lean/README.zh-CN.md) 时，子会话仅过滤继承的目标控制消息，不注册任何目标工具、命令或调度器；在活跃目标下派发的后台 `Agent` 与 `SubagentWorkflow` 未交回结果前，自动拦截目标续跑与完成验收。
- **Todo 面板智能避让** — 搭配 [`rpiv-todo-lean`](../rpiv-todo-lean/README.zh-CN.md) `0.1.17+` 时，活跃目标会自动收起当前所属终端会话的 Todo 面板；当 Autoresearch 未开启时执行 `/goal-pause` 即可恢复 Todo 显示，且不影响其他会话的 Todo 面板。

## 安装

需要 Pi `>=1.7.0 <2.0.0`。推荐直接从 npm 安装（无需锁定版本号）：

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi update --extensions
```

如需启用子会话隔离与后台等待门禁，请同时安装或更新 [`pi-subagents-lean`](../pi-subagents-lean/README.zh-CN.md)：

```bash
pi install npm:@gfgghgftgffg/pi-subagents-lean
```

如需从单仓本地 checkout 回退安装，在仓库根目录执行：

```bash
node scripts/install-extension.mjs pi-goal-x-lean
```

> [!IMPORTANT]
> 请勿与原版 `pi-goal-x` 或其他 goal 封装扩展同时加载。本地 Git 安装需通过拉取仓库并重新运行 `install-extension.mjs` 更新（`pi update` 不会更新本地目录）。迁移至 npm 来源前，请先备份配置，根据 `pi list` 移除精确的旧来源后再安装 npm 包。

## 使用方法

### 终端命令

交互式起草目标并在确认计划后启动：

```text
/goal 为报表添加 CSV 导出，完成要求包括测试和使用说明
```

| 命令 | 作用 |
| --- | --- |
| `/goal [目标]` | 交互式起草目标，确认计划后启动执行 |
| `/goal-direct <目标>` | 跳过起草，直接创建并启动目标 |
| `/sisyphus [目标]` | 起草带逐步验收标准的有序目标（`/sisyphus-direct` 为直接创建） |
| `/goal-tweak <修改>` | 修订当前目标内容或 token 预算 |
| `/goal-pause` / `/goal-resume [文本]` | 暂停目标 / 恢复执行（可附带补充说明） |
| `/goal-status [verbose\|health]` | 打开只读状态面板，检查存储与运行时健康度 |
| `/goal-refresh` | 强制重新扫描磁盘目标文件、设置与账本 |
| `/goal-settings` | 打开目标配置与控制项 |

其余辅助命令（`/goal-list`、`/goal-focus`、`/goal-unfocus`、`/goal-clear`、`/goal-cancel`、`/goal-recovery`）详见[上游文档](https://github.com/tmonk/pi-goal-x#readme)。

### 模型工具调用

`get_goal` 可直接调用，也可通过 `goal` 路由调用；其余写入与起草操作统一经由 `goal` 调度（`op` 填写操作名，`input` 填写 JSON 对象字符串）：

**读取目标任务区段：**

```json
{ "op": "get_goal", "input": "{\"section\":\"tasks\"}" }
```

**暂停或更新目标：**

```json
{ "op": "update_goal", "input": "{\"status\":\"paused\",\"reason\":\"等待决定\"}" }
```

**展开单操作的全部参数与示例：**

```json
{ "op": "help", "input": "update_goal_task" }
```

传入未知操作名、非法 JSON 或非对象 `input` 时，工具会直接返回明确的错误结果。

## 配置与边界说明

- **外部编辑刷新** — 常规读取可能命中缓存快照；在 Pi 外部手动修改目标文件后，请执行 `/goal-refresh` 重新扫描（日常修订建议优先使用 `/goal-tweak`）。
- **服务异常自动暂停** — 遇到不可重试的模型服务错误或耗尽网络重试上限时，目标会自动持久暂停；排障后通过 `/goal-resume [文本]` 继续。
- **目标里程碑与 `todo` 独立** — Goal 任务是写入目标记录的持久化里程碑，与当前会话的 `todo` 清单互不同步。
- **Subagents 追踪范围** — 后台等待门禁仅追踪目标处于活跃状态时经由 `subagent`、`Agent` 或 `SubagentWorkflow` 发起的任务；请勿在同一批工具调用中混用结果读取与 Agent `resume`。等待门禁作用于整个父会话，不设自动超时或恢复调度，重载后不重建；CLI workflow、mention、外部 RPC 以及目标激活前已启动的任务不在追踪范围内。

## 模型可见工具文本（字符代理）

<!-- amox-measurement:start -->
| 包 | 模型可见工具（字符代理） |
| --- | ---: |
| @gfgghgftgffg/pi-goal-x-lean | 188 |
| pi-goal-x | 1691 |

只统计发给模型的工具声明；固定按 `ceil(字符数 / 4)` 估算，不是服务商计费 token。
<!-- amox-measurement:end -->

## 来源与开发

本包是 [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md) 面向 [tmonk/pi-goal-x](https://github.com/tmonk/pi-goal-x) 编写的原创精简门面，以精确依赖复用上游运行时，不复制引擎代码；两者均采用 MIT 许可证。

按需路由设计与协同契约详见[开发检查与维护策略](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)及包内 [MAINTENANCE.md](MAINTENANCE.md)。
