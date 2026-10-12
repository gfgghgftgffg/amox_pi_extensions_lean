# @gfgghgftgffg/rpiv-todo-lean

隶属于 [`amox-pi-extensions-lean`](../../README.md) 单仓。基于
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

从仓库根目录只安装本扩展（先按根 README 克隆仓库）：

```bash
node scripts/install-extension.mjs rpiv-todo-lean
```

已发布到 npm 后，也可用 `pi install npm:@gfgghgftgffg/rpiv-todo-lean`。两种方式只选一种，请勿与其它 `rpiv-todo` 包装扩展同时加载。

## 使用方法

模型仅看到一个 `todo` 工具，操作包括 `create`、`update`、`list`、`get`、`delete`、`clear`。
通常需要显式传入 `action`；省略时封装会依据 `subject` 推断 `create`，或依据 `id` 加可变字段推断
`update`，其余情况交由上游报错。

## 本次审查：2.13.5 → 2.13.8

上游 2.13.6–2.13.8 的 CHANGELOG 条目没有列出工具或行为变化。核对工具 Schema、注册／执行路径、
reducer、回放／store、覆盖层私有字段、配置适配器和 i18n loader／bridge 后，这些审查面源码保持一致。
lean 入口无需修改：仍为一个 `todo` 工具、六个 action、同样的 action 推断与逐会话 RPC 覆盖层。
create 仍默认 `pending`；list 默认排除 deleted tombstone，`includeDeleted: true` 可包含；clear 重置 ID 为 1。
持久化键仍为 `rpiv-todo-state`，继续兼容历史 toolResult 回放。

配套 i18n 固定版本同步到 2.13.8，上游传递依赖 rpiv-config 范围同步到 `^2.13.8`。
源码 revision 与审查边界见 [MAINTENANCE.md](MAINTENANCE.md)，既有回归断言全部保留。
本 agent 阶段**未运行**安装、测试、契约捕获或生产安装验证，交给独立任务执行；发版仍需人工确认。

## 上下文占用（字符代理）

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/rpiv-todo-lean | 0.1.1 | 247 |
| @juicesharp/rpiv-todo | 2.13.8 | 882 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## 版本

* 包装层：`0.1.1`
* 上游运行时：锁定 `@juicesharp/rpiv-todo@2.13.8` 与 `@juicesharp/rpiv-i18n@2.13.8`（精确版本）
* 此前基线测试使用 Pi `1.1.0`、Node `22.22.1`；本次候选等待独立任务验证。

## 开发

在仓库根目录运行：`npm ci`、`npm run check`、`npm run contracts:check`。

## 维护说明

适配点、上游元数据、升级步骤与限制见 [MAINTENANCE.md](MAINTENANCE.md)。

## 协议与致谢

MIT。本项目封装 MIT 协议的
[`@juicesharp/rpiv-todo`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo)；
上游代码以固定 npm 依赖方式使用，未复制进本仓库。
