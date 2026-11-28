# pi-goal-x-lean

[English](README.md)

[pi-goal-x](https://github.com/tmonk/pi-goal-x) 的轻量包装。上游引擎作为精确依赖保留，不做复制；本包精简模型可见的目标工具面，并通过 `pi-subagents-lean` 与 [@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) 协同。

## 概述

Goal 运行一个持久任务循环：模型创建目标、规划任务、逐步执行、记录证据并完成带审计的验收。本包不重新实现该循环，而是包装上游运行时，转发其命令、界面、设置、存储和调度器，只调整模型看到的工具面，并增加一层轻量委派保护。

包装层负责三件事：

- 在 Pi 1.7 及以上只直接声明 `get_goal`，其余六项操作通过一个 `goal` 调度工具暴露。
- 缩短工具描述并移除 schema 注解文本，同时保留参数约束和上游行为。
- 让目标归父会话管理，并在已追踪的 Agent/workflow 结果交回前阻止自动续跑或完成验收。

## 功能

- **保留七项操作**：`create_goal`、`get_goal`、`update_goal`、`set_goal_tasks`、`update_goal_task`、`goal_questionnaire` 和 `propose_goal_draft` 保留上游名称、参数校验、事件、确认、审计、渲染器和结果结构。
- **Pi 1.7+ 按需展开工具**：模型只看到 `get_goal` 和 `goal`。六项路由操作仍然激活且可调用，但不进入发给服务商的工具声明。
- **旧版 Pi 使用直接工具**：Pi 1.4 至 1.6 不安装路由，继续使用七个精简后的直接工具。
- **按操作查帮助**：`goal` 的 `op: "help"` 返回操作索引；附带主题后展开该操作的描述、指引、JSON schema 和示例。
- **随任务开关变化**：关闭任务跟踪时，`set_goal_tasks` 和 `update_goal_task` 不再路由或展示，起草指引要求省略 tasks。
- **阶段提示**：系统提示只增加当前阶段需要的起草、生命周期或任务提示；暂停的目标不会被提示规划或更新任务。
- **subagents 协同**：子会话只过滤继承的目标上下文；父会话持有目标，并等待后台委派结果。
- **默认透传**：未知的上游工具和未改动的 `ExtensionAPI` 调用保持原对象与行为。

## 工具面

### Pi 1.7 及以上

向模型声明两个目标工具：

| 工具 | 作用 |
| --- | --- |
| `get_goal` | 直接只读目标状态、任务和历史分页。它保持直接声明，停止后的回合仍可读取目标。 |
| `goal` | 仅模型可见的顺序调度工具，覆盖全部七项操作。`prepareLoadout` 隐藏其余六项声明，但不改变活动工具集合。 |

调用调度工具时，`op` 填操作名，`input` 填 JSON 字符串：

```text
goal({ op: "help", input: "update_goal_task" })
goal({ op: "update_goal", input: "{\"status\":\"paused\",\"reason\":\"等待决定\"}" })
```

`get_goal` 可直接调用，也可经调度工具调用。路由的写操作通过 Pi 的 `ctx.executeTool()` 进入原工具，保留内容、`details`、`terminate` 和错误状态。嵌套调用的 usage 由 Pi 汇总，包装层不重复计入。

错误按错误返回给模型，不会伪装成成功的包装文本。未知操作、当前工具组合中不可用的操作、非法 JSON 和非对象输入都会明确失败。终端把路由调用显示为一条 `goal` 记录；直接调用 `get_goal` 保留原显示方式。

### Pi 1.4 至 1.6

不安装路由和阶段提示。七个上游工具直接注册，使用精简后的描述和 schema，与旧版主机的工具声明模型一致。

### 关闭任务跟踪

除任务开关外，激活工具列表固定。关闭任务时，上游不激活 `set_goal_tasks` 和 `update_goal_task`；路由拒绝这两项，帮助也不再列出它们。起草指引要求模型省略 tasks。上游仍可能从带编号的起草目标推导任务，这是原有引擎行为。

## 安装

需要 Pi `>=1.4.0 <2.0.0`、Node `>=22.19.0`。安装时不固定版本：

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi update --extensions
```

单独使用 goal 不要求安装 subagents。需要协同能力时再安装：

```bash
pi install npm:@gfgghgftgffg/pi-subagents-lean
```

每个扩展只保留一个来源，不要另外加载原版 `pi-goal-x`；本包已经依赖精确的上游运行时。

从 Git checkout 安装可用 `node scripts/install-extension.mjs pi-goal-x-lean`。

## 使用

用目标和验收要求启动引导式目标：

```text
/goal 为报表添加 CSV 导出，完成要求包括测试和使用说明
```

检查并确认计划后开始执行。模型随后可以发起起草提问、提交草稿、设置任务树、记录进度，并用证据完成目标。

### 命令

| 命令 | 作用 |
| --- | --- |
| `/goal [目标]` | 启动带确认的引导式目标起草。 |
| `/goal-direct <目标>` | 立即创建目标。 |
| `/sisyphus [目标]` | 起草带逐步验收标准的有序持久目标。 |
| `/sisyphus-direct <目标>` | 立即创建有序目标。 |
| `/goal-tweak <修改>` | 确认后修订目标或 token 预算。 |
| `/goal-pause` | 暂停目标并停止当前回合。 |
| `/goal-resume [文本]` | 立即继续，续期自主运行额度，并可选地把文本发给 Agent。 |
| `/goal-clear` | 确认后归档当前目标。 |
| `/goal-list` | 列出项目中的开放目标。 |
| `/goal-status [verbose\|health]` | 显示只读面板，可附加详细模式或存储/运行时检查。 |
| `/goal-focus` / `/goal-unfocus` | 选择本会话聚焦的目标，或解除聚焦。 |
| `/goal-refresh` | 重新读取目标文件、设置和账本缓存。 |
| `/goal-recovery [repair]` | 检查损坏数据、过期锁和孤立快照；修复需要确认并保留备份。 |
| `/goal-settings [controls]` | 打开目标设置，或命令、按键、暂停顺序控制。 |
| `/goal-cancel` | 取消当前起草，不创建目标。 |

完整命令和设置说明见[上游文档](https://github.com/tmonk/pi-goal-x#readme)。

### 起草与修订

`goal_questionnaire` 批量提出起草问题，`propose_goal_draft` 打开确认。模式由用户发起的草稿决定，草稿工具不会自行选择 `sisyphus`。任务清单确认会结束当前回合，用户确认后继续。

要和 Agent 一起修订目标，请使用 `/goal-tweak`。在 Pi 之外编辑目标文件后，运行 `/goal-refresh` 强制重新扫描并校正当前目标；普通读取仍可能使用缓存快照。

### 服务商错误

遇到不可重试的服务商错误，或用尽配置的网络重试次数后，目标会暂停。修复服务商问题后使用 `/goal-resume [文本]`。可选文本会在目标恢复前发送给 Agent。

### 目标任务与 todo

目标任务是目标记录中的持久里程碑。独立的 `todo` 扩展管理当前回合的清单，两个方向都不与目标任务同步。

## subagents 协同

组合后有两项独立保证。

### 目标所有权留在父会话

`pi-subagents-lean` 发布一个只读的 `context.v1` 服务，底层读取真实 subagents runner 的 `AsyncLocalStorage`。本包用它识别子会话。子会话只注册上游的目标上下文过滤器，不安装目标工具、命令、路由、阶段提示或调度器。目标所有权留在父会话。角色模型、工具权限和 Task Router 规则不变，也不会自动启用路由。

如果加载了 subagents manager 却没有兼容的 `context.v1` 服务，目标门面会报兼容性错误，而不是根据环境标记猜测。请升级 `pi-subagents-lean`，不要只加载上游 subagents 扩展。

### 后台工作会挂起目标

目标处于活动状态时，通过 `subagent`（`run` 或 `workflow`）、原生 `Agent` 工具和 `SubagentWorkflow` 发起的调用会被追踪并建立挂起记录。在父会话收到完成通知，或成功读取完整终态结果之前，挂起记录会阻止自动续跑和 `update_goal(status=complete)`。

- 挂起覆盖整个父会话。未完成的工作也会阻止无关的下一步和其它目标；切换或新建目标不会清除挂起。
- 即使没有子 Agent 在运行，workflow 在阶段之间仍保持待完成。延迟通知会延长等待。后台执行结束本身不会释放挂起。
- 失败或停止的终态结果会释放该次运行的挂起，但不代表目标审计成功。
- 结果读取与 Agent `resume` 不允许并发。先读结果，再在下一批工具调用中 resume。该限制也覆盖可能指向同一 Agent 的 handle 和 ID 别名。
- resume 复用 Agent ID，因此通知还必须匹配当前调用的 tool-use 标记。仍标记为 `queued` 或 `running` 的通知不会释放挂起，旧通知也不能证明新一轮已经完成。
- 不追踪的入口包括 CLI 启动的 workflow、mention、外部 RPC、其它扩展的分发路径，以及目标激活前启动的工作。挂起记录只存在于当前父会话内存中，重载或恢复后不会重建。

本集成保留原生 subagents 通知，不把它们改写为 `pi-goal:wake`。由这些通知唤起的父模型回合不计入目标的 `maxAutonomousRuns` 额度。上游严格模式的 wait/wake 协议仍可使用，但不是本保护层的默认路径。

Pi 1.7 普通对话首轮启用 Goal 时，请求体增加 196 token；这是用 `gpt-4o` 分词器相对已安装基线 1248 的测量值。起草和执行阶段会按需增加少量阶段提示。逐主题帮助及读取、任务、起草的总量见[测量说明](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/goal-tools-design.zh-CN.md)。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-goal-x-lean | 1297 |
| pi-goal-x | 1691 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 限制与失败模式

- 委派保护依赖上游私有的 `_goalCore.scheduler.schedule/claim` 接缝，以及 subagents 的任务 ID、结果头部和通知标记。缺少调度接缝时，门面会拒绝加载，而不是在没有完成保护的情况下运行。
- 保护层不增加超时、轮询、唤醒或恢复调度。任务停滞或暂停、通知丢失，或通过未追踪路径消费结果，都可能让挂起永久保留。`/goal-resume` 和切换目标不会清除挂起。
- Agent 结果工具无法读取 workflow ID，因此 workflow 通知丢失后无法通过结果读取补偿。
- 挂起是保守的：任何已追踪的未完成工作都会阻止整个父会话的完成验收和自动续跑，等待期间会减少自主推进。
- 保护层不会停止正在运行的任务，不阻止正常用户输入，也不阻止父 Agent 在当前回合使用工具。部分完成通知可以唤醒父会话处理结果，但剩余挂起仍会阻止最终完成。
- 目标审计默认排除项目扩展。启用 `auditorProjectResources` 会扩大资源发现范围；只读审计策略不是操作系统级沙箱。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.ts` | 上游扩展的门面：工具元数据、代理转发、子会话分支和委派保护接线。 |
| `router.ts` | Pi 1.7 的 `goal` 调度、工具声明隐藏、帮助主题和阶段提示。 |
| `delegation.ts` | 后台 Agent/workflow 挂起、结果与 resume 冲突检查，以及完成验收门禁。 |
| `integration.ts` | 读取 `pi-subagents-lean` 的 `context.v1` 子会话服务。 |

## 开发

在本目录运行包检查：

```bash
npm test
npm run typecheck
npm run check
```

Pi 1.7 主机场景需要显式启用。把测试指向已安装主机的入口：

```bash
PI_GOAL_TEST_HOST_17=/path/to/pi-1.7/dist/index.js npm test
```

服务商计量使用仓库脚本：

```bash
/home/ubuntu/miniforge3/envs/codex/bin/python scripts/measure-goal-provider.py
```

## 延伸阅读

- [pi-goal-x 上游](https://github.com/tmonk/pi-goal-x)
- [@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents)
- [Goal 工具设计与测量](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/goal-tools-design.zh-CN.md)

## 维护

联动范围、并发限制、副作用及升级验证见 [MAINTENANCE.md](MAINTENANCE.md)。
