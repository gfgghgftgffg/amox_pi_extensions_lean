# @gfgghgftgffg/rpiv-todo-lean

隶属于 [`amox-pi-extensions-lean`](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.zh-CN.md) 单仓。基于
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo) 的精简封装：
保留完整任务管理引擎，使用紧凑扁平 Schema，并保留原 lean 封装的 RPC/会话/覆盖层行为与逐会话隔离。

原 lean 封装作者 [kunkun9527](https://github.com/kunkun9527/rpiv-todo-lean)，上游扩展作者
[juicesharp](https://github.com/juicesharp/rpiv-mono)。两者均为 MIT 协议，本包保留原始 `LICENSE`。

## 核心特性

* 完整任务生命周期：`create`、`update`、`list`、`get`、`delete`、`clear`，状态流转、`blockedBy`
  依赖、元数据、`/todos` 命令与分支回放全部沿用上游。
* 精简模型侧 Schema：保留原生扁平 Schema，仅去除冗长字段描述，将 Prompt 指南压缩为一行。
* 保留上游持久化：每次改变状态仍写入上游的 `rpiv-todo-state` 自定义条目，codemode 等路径下的回放不受影响。
* 保留 RPC/会话行为：逐会话状态槽、逐会话覆盖层、失效上下文处理及快捷键/命令包装均与原 lean 封装一致。

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

新任务默认 `pending`；list 默认不含已删除任务，`includeDeleted: true` 可包含；clear 重置任务 ID 为 1。
状态通过 `rpiv-todo-state` 条目持久化，保留历史工具结果回放。RPC 响应不会额外追加全量 Plan 快照。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/rpiv-todo-lean | 0.1.5 | 247 |
| @juicesharp/rpiv-todo | 2.13.8 | 882 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 版本

* 包装层：`0.1.5`
* 上游运行时：锁定 `@juicesharp/rpiv-todo@2.13.8` 与 `@juicesharp/rpiv-i18n@2.13.8`（精确版本）
* 开发测试基线：Pi `1.1.0`、Node `22.22.1`。

## 开发

在仓库根目录运行：`npm ci`、`npm run check`、`npm run contracts:check`。

## 维护说明

适配点、上游元数据、升级历史、源码审查决定与限制见 [MAINTENANCE.md](MAINTENANCE.md)。
README 只说明当前用法，不记录逐次发布过程。

## 协议与致谢

MIT。本项目封装 MIT 协议的
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo)；
上游代码以固定 npm 依赖方式使用，未复制进本仓库。
