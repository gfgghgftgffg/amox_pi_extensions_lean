# @gfgghgftgffg/rpiv-todo-lean

[English](README.md)

## 优点

为 [`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo) 提供更轻量的封装。任务、依赖、批量创建和 `/todos` 都还在，首轮就要带上的工具注册文本大约少 77%。

## 功能

- 模型只看到一个 `todo` 工具：`create`、`update`、`list`、`get`、`delete`、`clear`。
- 省略 `action` 时，带 `subject` 按创建处理，带 `id` 和可改字段按更新处理。其余情况由上游报错。
- 字段、校验、持久化和按会话隔离仍在上游引擎里。`/todos` 仍可用。

## 来源

门面来自 [kunkun9527/rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean)。引擎是 [juicesharp/rpiv-todo](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo)。本包跟随上游发布，不复制引擎。两者都是 MIT，本包保留原始 `LICENSE`。它属于 [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md)。

## 使用方法

建一条任务。只写 `subject` 即可：

```json
{ "subject": "Inspect the cache" }
```

一次建多条：

```json
{ "action": "create", "tasks": [{ "subject": "Inspect" }, { "subject": "Test" }] }
```

把一条标成完成。有 `id` 再加一个字段，就是更新：

```json
{ "id": "1", "status": "completed" }
```

列出、读取、删除，或清空：

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

新任务一开始是 `pending`。分几步做时，保持一条为 `in_progress`，做完改成 `completed`。`list` 不显示已删除的任务。`clear` 清空列表并重新编号。依赖用 `blockedBy`。其余字段见[上游文档](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo)。

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
