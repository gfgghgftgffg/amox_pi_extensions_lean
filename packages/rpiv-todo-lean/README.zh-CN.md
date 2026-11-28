# @gfgghgftgffg/rpiv-todo-lean

[![npm](https://img.shields.io/npm/v/@gfgghgftgffg/rpiv-todo-lean?style=flat-square)](https://www.npmjs.com/package/@gfgghgftgffg/rpiv-todo-lean)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.1.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**面向 [`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo) 的轻量封装，完整保留任务依赖、批量创建与 `/todos`，减少约 77% 的常驻工具声明文本。**

[English](README.md)

剔除 `todo` Schema 中的冗长字段描述，同时完整保留上游引擎的参数校验、会话隔离、持久化快照、RPC 覆盖层与终端面板交互。

## 核心特性

- **精简单一工具** — 模型仅见一个 `todo` 工具（支持 `create`、`update`、`list`、`get`、`delete`、`clear`），结构约束与上游完全一致。
- **直觉化简写推断** — 省略 `action` 时，仅传 `subject` 自动按创建处理，传入 `id` 加任意可改字段自动按更新处理；其余歧义输入交由上游校验报错。
- **灵活的终端面板控制** — 在 [todo 配置](https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-todo/docs/configuration.md)中设置 `maxWidgetLines: 0` 可在下次重绘时隐藏面板，不影响 `todo` 工具与 `/todos` 命令。全屏 TUI 下左键点击面板标题即可折叠或展开（即使 `collapseKey` 设为 `"off"`）。
- **多会话与多工作流避让** — 子会话启动任务不再误隐藏前台会话的已完成行；在 Pi 终端 UI 中，当 Autoresearch 开启或当前会话拥有活跃 Goal（需搭配 `pi-goal-x-lean` `>=0.1.7`）时自动隐藏 Todo 面板，暂停 Goal 或执行 `/autoresearch off` 使两者均不活跃后自动恢复显示。

## 安装

推荐直接从 npm 安装（无需锁定版本号）：

```bash
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi update --extensions
```

如需从单仓本地 checkout 回退安装，在仓库根目录执行：

```bash
node scripts/install-extension.mjs rpiv-todo-lean
```

> [!IMPORTANT]
> 请勿与其他 `rpiv-todo` 扩展或封装同时加载。本地 Git 安装需通过拉取仓库并重新运行 `install-extension.mjs` 更新（`pi update` 不会更新本地目录）。迁移至 npm 来源前，请先备份配置，按 `pi list` 移除精确的旧来源后再安装 npm 包。

## 使用方法

**创建单条任务（只传 `subject` 即自动创建）：**

```json
{ "subject": "Inspect the cache" }
```

**原子化批量创建任务：**

```json
{ "action": "create", "tasks": [{ "subject": "Inspect" }, { "subject": "Test" }] }
```

**更新任务状态（传入 `id` 与修改字段即自动更新）：**

```json
{ "id": "1", "status": "completed" }
```

**列出、读取、删除或清空任务：**

```json
{ "action": "list" }
```

```json
{ "action": "get", "id": "1" }
```

```json
{ "action": "delete", "id": "1" }
```

```json
{ "action": "clear" }
```

> [!TIP]
> 新建任务初始状态为 `pending`。多步骤执行时建议同一时刻仅保留一条 `in_progress`，完成后立即改为 `completed`。`list` 默认隐藏已删除任务，`clear` 清空列表并重置编号，前置依赖通过 `blockedBy` 声明；完整字段说明见[上游文档](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo)。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/rpiv-todo-lean | 277 |
| @juicesharp/rpiv-todo | 1281 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 来源与开发

门面源自 [kunkun9527/rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean)，底层引擎依赖 [juicesharp/rpiv-todo](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo)，在 [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md) 中持续跟进上游发布，不复制引擎代码。两者均采用 MIT 许可证，保留原始 `LICENSE`。

仓库开发规范与 RPC 上下文防护细节详见[开发检查与维护策略](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)及包内 [MAINTENANCE.md](MAINTENANCE.md)。
