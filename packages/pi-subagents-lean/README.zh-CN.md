# @gfgghgftgffg/pi-subagents-lean

隶属于 [`amox-pi-extensions-lean`](../../README.md) 单仓。基于
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

从仓库根目录只安装本扩展（先按根 README 克隆仓库）：

```bash
node scripts/install-extension.mjs pi-subagents-lean
```

已发布到 npm 后，也可用 `pi install npm:@gfgghgftgffg/pi-subagents-lean`。两种方式只选一种，请勿与其它 `pi-subagents` 包装扩展同时加载。

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

## 本次审查：0.20.0 → 0.21.0

四个上游工具的名称、参数 Schema、默认值与执行签名不变，lean 入口无需修改。高级选项仍放入
`input` 并通过 `help` 查询；会话始终只暴露一个 `subagent` 工具。

后台 Agent、分组和 Workflow 的完成通知现在进入 steering 队列：忙碌父会话在当前工具批次结束后、
下一次模型调用前收到，不打断正在运行的工具。前台新派生任务运行中可在编辑器有焦点时按 `ctrl+b`
将全部前台任务转后台，或在会话 viewer 按 `b` 将单个任务转后台；调用返回 ID，任务继续执行并在完成时通知。
viewer 也会遵循 Pi 的全屏模式与滚动条设置。

Agent 文件的 `isolated` 现在对 Workflow 子任务、mention 和 RPC 都生效，文件设置优先于调用参数。
文件的 `isolation` 同样覆盖 mention/RPC，指定 worktree 而目录不是可用 git 仓库时会启动失败；
Workflow 的 worktree 仍只由脚本选项决定。子会话继承父会话项目 trust，跨目录派生不会自动信任目标目录。
`extensions: true` 的子会话现在加载 Pi 内置 codemode、tool search 和 MCP，每个子会话启动自己的 MCP
服务器；可用 Agent 的 `exclude_extensions: builtin:mcp`、全局 `-builtin:mcp` 或 `--no-mcp` 关闭。
子工具作用域尊重 exposure/defaultActive，并检查嵌套的 `ctx.executeTool` 调用。

源码证据与测试边界见 [MAINTENANCE.md](MAINTENANCE.md)。

## 本次审查：0.21.0 → 0.22.0

四个工具的名称、字段、required、执行／渲染签名与调用默认值继续兼容，lean 入口无需改动。
默认 `smart` join 现在在父会话下一边界报告已完成任务，不等待其它同批任务；`async` 语义相同。
忙碌父会话在工具批次后一次收到已完成任务；空闲父会话约 200 ms 后启动一轮，并合并窗口内的完成。
需要等待整批时使用 `group` join 设置：按父会话 turn 分组，单个任务和跨 turn 的任务不再分组。
Esc 时待发完成通知会保留，在被中断的运行结束后启动新一轮；完成结果在发送前被读取即可取消通知。

已安装 Pi 包可用 `pi.subagents` 或 `pi-subagents` 声明 Agent 与 Workflow；默认启用，优先级低于
用户自己的定义。仅由不受信任项目配置的包不可见。`subagents.json` 中 `packageAgents` 与
`packageWorkflows` 支持 `true`、`false` 或包白名单。包 Agent 在 `/agents` 中只读，可 Eject／Disable。
发现／trust 设置变更后重新加载扩展以更新门面的启动名单。Shutdown 现在也释放 widget、group-join
与 completion-outbox 状态。

候选检查在独立沙箱捕获新字符统计并运行既有门面／集成回归、类型检查、生产安装和审计。
真实模型／MCP 与交互通知时序不在这些检查范围；三平台 CI 后仍需人工审查发版。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/pi-subagents-lean | 0.1.2 | 270 |
| @tintinweb/pi-subagents | 0.22.0 | 8415 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 版本

* 包装层：`0.1.2`
* 上游运行时：锁定 `@tintinweb/pi-subagents@0.22.0`（精确版本）
* 要求 Pi `>=1.1.0`（上游 peer 下限不变）；此前基线测试使用 Pi `1.1.0`、Node `22.22.1`，本次候选等待独立任务验证。

## 开发

在仓库根目录运行：`npm ci`、`npm run check`、`npm run contracts:check`。

## 维护说明

适配点、上游元数据、升级步骤与限制见 [MAINTENANCE.md](MAINTENANCE.md)。

## 协议与致谢

MIT。本项目封装 MIT 协议的
[`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents)；上游代码以固定 npm 依赖方式使用，
未复制进本仓库。
