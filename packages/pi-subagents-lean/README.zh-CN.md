# @gfgghgftgffg/pi-subagents-lean

隶属于 [`amox-pi-extensions-lean`](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md) 单仓。基于
[`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) 的精简封装：完整 Subagent/Workflow
运行时收束为一个 `subagent` 工具。

原 lean 封装作者 [kunkun9527](https://github.com/kunkun9527/pi-subagents-lean)，上游扩展作者
[tintinweb](https://github.com/tintinweb/pi-subagents)。两者均为 MIT 协议，本包保留原始 `LICENSE`。

## 核心特性

* 完整上游运行时：Agent 发现、后台派生、结果获取、运行中引导、Workflow、Schedule 与生命周期管理均使用上游实现。
* 单一工具入口：`Agent`、`get_subagent_result`、`steer_subagent`、`SubagentWorkflow` 由 `subagent` 按
  `run`/`result`/`steer`/`workflow`/`help` 操作路由。
* 高级参数按需展开：`input` 传入 JSON 对象，执行前会用真实上游 Schema 校验；`help` 返回当前上游完整 Schema。
* 可用 Agent 名单：`subagent_type` 展示扩展启动时捕获的已启用类型。修改 Agent 定义或设置后需重新加载；上游描述
  格式无法识别时，用 `help` 搭配 `input: "run"` 查询。
* 渲染委托上游工具，保留原始调用/结果卡片。

## 安装

这是公开的 npm 包，安装时不固定版本：

```bash
pi install npm:@gfgghgftgffg/pi-subagents-lean
pi update --extensions
```

需要 Git 回退安装时，在仓库 checkout 根目录执行：

```bash
node scripts/install-extension.mjs pi-subagents-lean
```

本地 Git 安装通过拉取 checkout 并重跑安装脚本更新，`pi update` 不更新本地内容。只保留一种安装来源。迁移时先备份 settings，移除 `pi list` 显示的精确旧来源，再安装 npm 来源。请勿同时加载其它 `pi-subagents` 包装扩展。

## 使用方法

```json
{
  "op": "run",
  "prompt": "Find the implementation of the cache key.",
  "description": "Locate cache key",
  "subagent_type": "Explore",
  "run_in_background": true
}
```

* `result` 搭配 `agent_id` 查看已完成任务的输出。
* `steer` 搭配 `agent_id` 与 `message` 调整运行中的 Agent。
* `workflow` 运行脚本化多 Agent 流程，参数以 JSON 放在 `input`。
* `help` 的 `input` 传操作名，返回对应上游工具的完整描述与 Schema。

## 重要提醒：检查 Agent 定义配置

上游运行时会自动扫描全局、工作区及项目目录中的内置与自定义 Agent。本仓库不包含任何私有 Agent、会话或记忆配置，
但完整继承该发现机制。安装后建议：检查扫描到的 Agent 定义（尤其是 `model` 字段）、移除不需要的类型、调整
Prompt/工具/扩展白名单，并注意与内置 `general-purpose`、`Explore`、`Plan` 的命名冲突。

## 运行行为与设置

后台 Agent、分组和 Workflow 的完成通知使用 steering 队列，不打断正在运行的工具。`smart` 和
`async` join 在父会话下一边界报告完成项，不等待同批其它任务。忙碌父会话在工具批次后一次收到
合并消息；空闲父会话约 200 ms 后启动一轮。需要等待整批时使用 `group`；单个任务和跨 turn
任务不分组。Esc 后保留待发通知，发送前读取已完成结果即可取消其通知。

前台任务可在编辑器有焦点时按 `ctrl+b` 全部转后台，或在 viewer 按 `b` 将单个任务转后台；
调用返回 ID，完成后通知。viewer 遵循 Pi 的全屏模式与滚动条设置。

已安装的包可在 `pi.subagents` 或 `pi-subagents` 声明 Agent/Workflow；默认启用，优先级低于用户
自己的定义，仅由不受信任项目配置的包不可见。`subagents.json` 中的 `packageAgents` 与
`packageWorkflows` 支持 `true`、`false` 或包白名单。包 Agent 在 `/agents` 中只读，可 Eject／Disable。
发现或 trust 设置变更后重新加载扩展，刷新门面的启动名单。

Agent 文件的 `isolated` 对 Workflow 子任务、mention 和 RPC 生效，优先于调用参数；文件的
`isolation` 同样适用于 mention/RPC，worktree 要求可用的 git 仓库。Workflow 的 worktree 仍由脚本
选项决定。子会话继承父会话项目 trust，跨目录派生不会自动信任目标目录。

`extensions: true` 的子会话加载内置 codemode、tool search 和 MCP，每个子会话使用自己的 MCP
服务器。可用 Agent 的 `exclude_extensions: builtin:mcp`、全局 `-builtin:mcp` 或 `--no-mcp` 关闭 MCP。
子工具作用域尊重 exposure/defaultActive，也检查嵌套的 `ctx.executeTool` 调用。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/pi-subagents-lean | 0.1.6 | 270 |
| @tintinweb/pi-subagents | 0.22.0 | 8415 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 版本

* 包装层：`0.1.6`
* 上游运行时：锁定 `@tintinweb/pi-subagents@0.22.0`（精确版本）
* 要求 Pi `>=1.1.0`。开发测试基线：Pi `1.1.0`、Node `22.22.1`。

## 开发

在仓库根目录运行：`npm ci`、`npm run check`、`npm run contracts:check`。

## 维护说明

适配点、上游元数据、升级历史、源码审查决定与限制见 [MAINTENANCE.md](MAINTENANCE.md)。
README 只说明当前用法，不记录逐次发布过程。

## 协议与致谢

MIT。本项目封装 MIT 协议的
[`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents)；上游代码以固定 npm 依赖方式使用，
未复制进本仓库。
