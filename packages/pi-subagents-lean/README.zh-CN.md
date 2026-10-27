# @gfgghgftgffg/pi-subagents-lean

隶属于 [`amox-pi-extensions-lean`](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md) 单仓。基于
[`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) 的精简封装：完整 Subagent/Workflow
运行时收束为一个 `subagent` 工具。运行时随上游更新。

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

后台任务完成后会通知父会话，无需轮询或等待。后台执行、Workflow、worktree 和
`subagents.json` 的配置见[上游文档](https://github.com/tintinweb/pi-subagents)。
修改 Agent 定义、发现范围或 trust 设置后重新加载扩展，刷新门面的可用类型名单。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-subagents-lean | 270 |
| @tintinweb/pi-subagents | 8415 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 开发

[开发检查与维护策略](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)；适配细节见 [MAINTENANCE.md](MAINTENANCE.md)。
