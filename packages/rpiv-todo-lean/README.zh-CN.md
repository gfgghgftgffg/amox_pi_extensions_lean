# @gfgghgftgffg/rpiv-todo-lean

隶属于 [`amox-pi-extensions-lean`](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md) 单仓。基于
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo) 的精简封装：
将完整任务管理引擎收束为一个紧凑的 `todo` 工具。运行时随上游更新。

原 lean 封装作者 [kunkun9527](https://github.com/kunkun9527/rpiv-todo-lean)，上游扩展作者
[juicesharp](https://github.com/juicesharp/rpiv-mono)。两者均为 MIT 协议，本包保留原始 `LICENSE`。

## 核心特性

* 保留上游任务生命周期、依赖、批量创建和 `/todos` 界面。
* 压缩描述和 Schema，保留原生字段、校验、持久化与会话隔离。

## 安装

这是公开的 npm 包，安装时不固定版本：

```bash
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi update --extensions
```

需要 Git 回退安装时，在仓库 checkout 根目录执行：

```bash
node scripts/install-extension.mjs rpiv-todo-lean
```

本地 Git 安装通过拉取 checkout 并重跑安装脚本更新，`pi update` 不更新本地内容。只保留一种安装来源。迁移时先备份 settings，移除 `pi list` 显示的精确旧来源，再安装 npm 来源。请勿同时加载其它 `rpiv-todo` 包装扩展。

## 使用方法

模型仅看到一个 `todo` 工具，操作包括 `create`、`update`、`list`、`get`、`delete`、`clear`。
通常需要显式传入 `action`；省略时封装会依据 `subject` 推断 `create`，或依据 `id` 加可变字段推断
`update`，其余情况交由上游报错。

创建任务传 `subject`；批量创建使用 `action: "create"` 和 `tasks`，例如
`{"action":"create","tasks":[{"subject":"Inspect"},{"subject":"Test"}]}`。
更新和查询指定任务时传 `id`，依赖使用 `blockedBy`。

新任务默认 `pending`。多步骤工作保持一个任务为 `in_progress`，完成后及时标记为 `completed`。
`list` 默认不含已删除任务；`clear` 清空列表并重置 ID。
完整字段、批量规则和 `/todos` 用法见[上游文档](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo)。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/rpiv-todo-lean | 277 |
| @juicesharp/rpiv-todo | 1222 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 开发

[开发检查与维护策略](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)；适配细节见 [MAINTENANCE.md](MAINTENANCE.md)。
