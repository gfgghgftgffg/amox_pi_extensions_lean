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

## 上下文占用（字符代理）

由 [`scripts/capture-contracts.mjs`](../../scripts/capture-contracts.mjs) 在隔离的 Pi 1.1.0 print 模式会话中测量
（原始数据见 [`maintenance/tool-contracts.json`](../../maintenance/tool-contracts.json)）。估算方式为固定字符代理
`ceil(字符数 / 4)`，**不是** 模型 tokenizer 计费值。

| 版本 | 注册工具 | 注册合计 | 绑定时激活 |
| --- | --- | ---: | ---: |
| Lean `@gfgghgftgffg/pi-subagents-lean@0.1.0` | `subagent` | **270** | **270** |
| 上游 `@tintinweb/pi-subagents@0.20.0` | `Agent` 2,533 + `SubagentWorkflow` 5,584 + `get_subagent_result` 158 + `steer_subagent` 159 | **8,415** | **8,415** |

## 版本

* 包装层：`0.1.0`
* 上游运行时：锁定 `@tintinweb/pi-subagents@0.20.0`（精确版本）
* 要求 Pi `>=1.1.0`（上游 peer 下限）；已测试 Pi `1.1.0`、Node `22.22.1`

## 开发

在仓库根目录运行：`npm ci`、`npm run check`、`npm run contracts:check`。

## 维护说明

适配点、上游元数据、升级步骤与限制见 [MAINTENANCE.md](MAINTENANCE.md)。

## 协议与致谢

MIT。本项目封装 MIT 协议的
[`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents)；上游代码以固定 npm 依赖方式使用，
未复制进本仓库。
