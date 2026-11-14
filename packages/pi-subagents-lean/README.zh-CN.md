# @gfgghgftgffg/pi-subagents-lean

[English](README.md)

## 优点

为 [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) 提供更轻量的封装。Agent、取结果、中途改向和 Workflow 收成一个 `subagent`，首轮就要带上的工具注册文本大约少 97%。

## 功能

- `run`、`result`、`steer`、`workflow` 和 `help` 都走这一个工具。后台任务、workflow、日程和原来的结果卡片仍用上游运行时。
- 冷门参数放在 `input` 里，是一段 JSON 对象字符串。调用前按真实上游 schema 校验。`help` 返回这份 schema。
- `subagent_type` 列出扩展启动时启用的 Agent 类型。改了 Agent 文件后要重新加载。上游描述无法解析时，用 `help`，`input` 设为 `"run"`。
- FleetView 将嵌套 Agent 列在父 Agent 下，显示各自的 token 用量。`❯` 标记光标，`●` 标记当前打开的视图；开启 `showModel` 时，列表也显示模型和思考级别。
- 提供只读子会话识别接口，让 `pi-goal-x-lean` 将目标管理留在父 Agent。

## 来源

门面来自 [kunkun9527/pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean)。运行时是 [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents)。本包跟随上游发布，不复制引擎。两者都是 MIT，本包保留原始 `LICENSE`。它属于 [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md)。

## 使用方法

启动一个 Agent：

```json
{
  "op": "run",
  "prompt": "Find the implementation of the cache key.",
  "description": "Locate cache key",
  "subagent_type": "Explore",
  "run_in_background": true
}
```

读取已完成的结果。用 `run` 返回的 `agent_id`；重新加载后也可以用保存的 handle。保存的结果会在有完成时间时显示该时间及距今时长：

```json
{ "op": "result", "agent_id": "agent-id" }
```

给还在跑的 Agent 发新指令：

```json
{ "op": "steer", "agent_id": "agent-id", "message": "Also check the tests." }
```

运行 workflow。参数写成 JSON 文本放进 `input`：

```json
{ "op": "workflow", "input": "{\"name\":\"review-panel\"}" }
```

查看某个操作的全部参数：

```json
{ "op": "help", "input": "run" }
```

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

需要 goal 联动时，通过 `pi install npm:@gfgghgftgffg/pi-goal-x-lean` 安装或更新配套的 [`pi-goal-x-lean`](../pi-goal-x-lean/README.zh-CN.md)。

## 重要提醒：检查 Agent 定义

上游会扫描全局、工作区和项目目录里的内置及自定义 Agent。本包不附带私有 Agent、会话或记忆。安装后检查每个 Agent 的 `model`，删掉不需要的类型，并避开与 `general-purpose`、`Explore`、`Plan` 重名。内置 Explore 默认继承会话模型，除非 Agent 文件自己指定。内置 `general-purpose` 在 workflow 之外可以继续委派，受上游深度和并发限制约束；同名自定义文件未设置 `allowed_subagents` 时仍禁用委派。Settings 默认保存到全局文件，项目已有 `.pi/subagents.json` 时保存到项目文件；Tab 可切换目标文件。

带过改动、后来被删掉的 worktree 不能重新打开；干净的 worktree 会在主 checkout 里打开。后台任务结束时通知父会话。配置了 `allowed_subagents` 的 Agent 共享默认最多 10 个运行中嵌套子 Agent 的限制，超限派生会失败，不会排队；顶层和 workflow Agent 不受此限制。通过 `/agents → Settings → Max nested concurrency` 配置（`0` 表示不限）。Agent 文件、workflow、worktree 和 `subagents.json` 见[上游文档](https://github.com/tintinweb/pi-subagents)；集成使用它的[事件](https://github.com/tintinweb/pi-subagents#events)和 [RPC](https://github.com/tintinweb/pi-subagents/blob/master/docs/rpc.md)。改了 Agent 定义、发现范围或 trust 设置后重新加载。行为说明在[更新日志](https://github.com/tintinweb/pi-subagents/blob/master/CHANGELOG.md)。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-subagents-lean | 270 |
| @tintinweb/pi-subagents | 8417 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 开发

[开发检查与维护策略](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)；适配细节见 [MAINTENANCE.md](MAINTENANCE.md)。
