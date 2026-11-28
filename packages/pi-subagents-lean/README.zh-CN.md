# @gfgghgftgffg/pi-subagents-lean

[![npm](https://img.shields.io/npm/v/@gfgghgftgffg/pi-subagents-lean?style=flat-square)](https://www.npmjs.com/package/@gfgghgftgffg/pi-subagents-lean)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.1.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**面向 [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) 的单工具超轻量封装，减少约 97% 的常驻工具声明文本。**

[English](README.md)

将子 Agent 启动、结果读取、运行中引导（steer）与脚本化工作流统一收敛到单一 `subagent` 工具，同时完整保留上游的后台调度、定时任务、FleetView 树形视图与原生结果卡片。

## 核心特性

- **五合一统一入口** — `run`、`result`、`steer`、`workflow` 与 `help` 共享同一个 `subagent` 工具，底层直接调用上游发布的运行时产物。
- **真实 Schema 校验的 JSON 透传** — 低频参数移出常驻声明，调用时通过 `input` 传入 JSON 对象字符串并在执行前按真实上游 Schema 严格校验；调用 `op: "help"` 即可按需展开完整定义。
- **Workflow 编写参考与暴露边界** — `workflow` 的 `help` 一并返回脚本编写参考（当 `workflowToolExposure` 设为 `"skill"` 时替换为上游内置 skill 路径）。门面在所有暴露模式下均保持单一工具形态，因此 `"deferred"` 不会单独延迟暴露 `workflow` 操作。
- **启动期 Agent 名单解析** — `subagent_type` 自动展示扩展加载时已启用的 Agent 类型（修改定义文件后需重载；若自定义描述无法解析，可调用 `op: "help"` 且 `input: "run"` 查询）。
- **嵌套 FleetView 与 Goal 协同桥接** — FleetView 在父节点下缩进展示嵌套子 Agent 及其独立 token 开销（`❯` 标记光标，`●` 标记当前打开视图，开启 `showModel` 时同步显示模型与思考级别）；同时提供只读子会话上下文识别服务，配合 [`pi-goal-x-lean`](../pi-goal-x-lean/README.zh-CN.md) 将目标管理严格留在父会话。

## 安装

推荐直接从 npm 安装（无需锁定版本号）：

```bash
pi install npm:@gfgghgftgffg/pi-subagents-lean
pi update --extensions
```

如需与持久目标联动，请同时安装或更新配套的 [`pi-goal-x-lean`](../pi-goal-x-lean/README.zh-CN.md)：

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
```

如需从单仓本地 checkout 回退安装，在仓库根目录执行：

```bash
node scripts/install-extension.mjs pi-subagents-lean
```

> [!IMPORTANT]
> 请勿与其他 `pi-subagents` 封装扩展同时加载。本地 Git 安装需通过拉取仓库并重新运行 `install-extension.mjs` 更新（`pi update` 不会更新本地目录）。迁移至 npm 来源前，请先备份配置，根据 `pi list` 移除精确的旧来源后再安装 npm 包。

## 使用方法

**启动子 Agent（下一步依赖结果时可设 `run_in_background: false` 内联等待；若 Agent 自身配置强制后台，则以配置为准）：**

```json
{
  "op": "run",
  "prompt": "Find the implementation of the cache key.",
  "description": "Locate cache key",
  "subagent_type": "Explore",
  "run_in_background": true
}
```

**查询状态或读取已完成输出（传入 `run` 返回的 `agent_id`，重载后也可传入已保存的 handle）：**

```json
{ "op": "result", "agent_id": "agent-id" }
```

`result` 默认立即返回当前状态或已完成结果；后台任务建议优先等待完成通知，仅在下一步必须阻塞等待运行中 Agent 时附加 `input: "{\"wait\":true}"`。存在完成时间的已保存记录会附带完成时刻与距今时长。

**向运行中的子 Agent 追加引导指令：**

```json
{ "op": "steer", "agent_id": "agent-id", "message": "Also check the tests." }
```

**运行明确请求的编排或指定名称的已保存 Workflow（仅要求启动若干个 Agent 时请并行调用 `run`）：**

```json
{ "op": "workflow", "input": "{\"name\":\"review-panel\"}" }
```

**查看指定操作的完整参数说明：**

```json
{ "op": "help", "input": "run" }
```

> [!TIP]
> 打印模式（`pi -p`）与 JSON 模式在退出前会自动等待后台 Agent 与 Workflow 收尾，以便父会话汇总结果作答；可在 `subagents.json` 中通过 `headlessWaitMinutes` 限制最长等待时间（默认 `0` 表示不限时）。子 Agent 同样会等待其派生的后台子任务结束后再完成，且只要父记录仍在保留期内即可读取子任务结果。

## Agent 定义检查与运行须知

> [!WARNING]
> 上游会自动扫描全局、工作区与项目目录中的内置及自定义 Agent（本包不附带任何私有 Agent、会话或记忆）。安装后请逐一核查各 Agent 的 `model` 配置、清理不需要的类型，并避免自定义文件与 `general-purpose`、`Explore`、`Plan` 重名。修改 Agent 定义、发现范围或项目信任（trust）设置后请重新加载扩展。

- **模型继承与会话续跑** — 内置 `Explore` 默认继承当前会话模型（除非定义文件显式指定）。续跑（resume）会沿用原会话记录的模型与思考级别（即使经过清理或重载）；修改定义文件中的模型或思考级别仅对新启动的 Agent 生效。原模型不可用时的回退机制见[上游更新日志](https://github.com/tintinweb/pi-subagents/blob/master/CHANGELOG.md)。
- **嵌套委派与并发上限** — 内置 `general-purpose` 可在 Workflow 之外继续派生子 Agent（同名自定义文件若未声明 `allowed_subagents` 则保持禁用）。所有开启 `allowed_subagents` 的 Agent 共享默认 `10` 个运行中嵌套子任务的全局上限（可在 `/agents → Settings → Max nested concurrency` 调整，`0` 为不限）；超限派生将直接报错而非排队，顶层与 Workflow Agent 不受此限。
- **配置落盘与缓存策略** — Settings 默认写入全局配置，若项目已存在 `.pi/subagents.json` 则写入项目配置（按 `Tab` 切换目标文件）。`cacheRetention` 默认 `inherit`，可设为 `none`、`short`、`long` 或在 Agent frontmatter 中设置 `cache_retention`，不影响父会话自身的缓存策略。
- **Worktree 恢复限制** — 含有未提交改动且已被删除的 worktree 无法重新打开；干净被删的 worktree 则会在主工作区重新打开。
- **事件总线、RPC 与脚本校验** — Agent 定义、worktree 与 `subagents.json` 详见[上游文档](https://github.com/tintinweb/pi-subagents)，扩展联动可对接上游[生命周期事件](https://github.com/tintinweb/pi-subagents#events)与 [RPC v2 接口](https://github.com/tintinweb/pi-subagents/blob/master/docs/rpc.md)（覆盖顶层、嵌套及 Workflow Agent；RPC 快照含待发通知与收尾中后代状态，总线完整结果独立于截断的通知文本，`stop` 默认最多等待 5 秒收尾）。`agent({ schema })` 的严格 draft-07 校验与失败诊断详见 [workflows.md](https://github.com/tintinweb/pi-subagents/blob/master/docs/workflows.md)。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-subagents-lean | 273 |
| @tintinweb/pi-subagents | 8832 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 来源与开发

门面源自 [kunkun9527/pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean)，底层运行时依赖 [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents)，在 [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md) 中持续跟随上游发布，不复制引擎源码。两者均采用 MIT 许可证，保留原始 `LICENSE`。

`dist` 产物门禁、子会话桥接契约与开发流程详见[开发检查与维护策略](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)及包内 [MAINTENANCE.md](MAINTENANCE.md)。
