# MAINTENANCE — rpiv-todo-lean

本文件记录本包与原 lean 基线的差异、锁定的上游版本、依赖的上游内部细节、升级步骤与已知限制。

## 来源与基线

- 上游扩展：`@juicesharp/rpiv-todo`（npm），作者 juicesharp，仓库
  <https://github.com/juicesharp/rpiv-mono>（`packages/rpiv-todo`），MIT。
- 本包代码基线：kunkun9527 的 lean 仓库 <https://github.com/kunkun9527/rpiv-todo-lean>，
  基线 commit `ec463cd90fbae962122fff2e0619955a8f17df1a`（tracked 文件整体复制，未复制上游代码）。
- 机器可读记录：仓库根 `maintenance/manifest.json`（`id: rpiv-todo-lean`）。

## 锁定的上游版本

- `@juicesharp/rpiv-todo@2.13.5`（精确固定；`dependencies`）。
- `@juicesharp/rpiv-i18n@2.13.5`（精确固定；上游 2.13.5 把 i18n 改为可选 peer，但保留安装以维持原行为的
  本地化 UI）。
- 上游 2.13.5 自带传递依赖 `@juicesharp/rpiv-config@^2.13.5`（由 npm 解析，不显式固定）。
- Pi 宿主 peer：`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`
  均为 `>=1.1.0`，`typebox` 为 `*`。
- 开发/测试依赖：Pi 1.1.0、typebox 1.3.27、jiti 2.7.0、TypeScript 5.9.3。

## 相对基线的精确改动（最小适配）

| 位置 | 改动 |
| --- | --- |
| `index.ts` | 在原有 RPC/会话/覆盖层逻辑上做 Pi 1.1 宿主适配：`isStaleCtxError` 同时识别旧消息 `Session is no longer valid` 与 Pi 1.1 的 `stale after session replacement`；新增 `ctxKind`/`rpcUiContext` 保护各事件、快捷键与 `/todos` 命令的预备 `ctx.mode`/`ctx.hasUI`/`ctx.ui` 读取（真实 invalidated ctx 上这些 getter 会抛 stale）；`/todos` 命令包装改为 async，在 guard 内 `await` 真实上游 handler（非 RPC 委派同样等待到完成），仅吞没识别出的 stale 拒绝（不再逃逸为 unhandled rejection），其余异步异常原样抛给宿主/调用方；RPC 覆盖层刷新排在上游完成之后。`getOrCreateRpcEntry` 改为接收已读出的 ui；`session_shutdown`/`agent_start` 及 UI 回调的兜底 catch 只忽略识别出的 stale 错误，其余异常照旧抛出。任务状态隔离、命令参数与既有委派行为不变。 |
| `package.json` | 改名 `@gfgghgftgffg/rpiv-todo-lean`、版本 `0.1.0`、仓库 `directory`、contributors 归属上游作者、依赖升级到 2.13.5、peer 下限改 1.1.0、devDeps 对齐；新增 `MAINTENANCE.md` 到 `files`。 |
| `tests/*.test.mjs` | 原有 6 个测试与断言全部保留；`wrapper`/`rpc-sessions` 顶部增加 `PI_CODING_AGENT_DIR`/session 目录隔离（不改断言）。新增 `tests/upstream-integration.test.mjs`：真实 2.13.5 reducer、`rpiv-todo-state` 持久化条目、Schema 枚举/字段与上游一致；`tests/stale-ctx.test.mjs`：真实 Pi 1.1 invalidated ctx、新旧 stale 消息在各事件处理器上的吞没、快捷键/命令行为，以及非 stale 错误的继续抛出；命令断言改为 await/`assert.rejects`，并新增真实 Pi 1.1 invalidated command ctx 上已注册 `/todos` 命令的等待结算（无 unhandled rejection）、上游异步非 stale 异常向调用方拒绝、成功路径上游先于 RPC 覆盖层刷新及非 RPC 委派等待的回归。 |
| `README*.md` | 重写为单仓说明、重新测量的字符代理数据与新版本号。 |
| `LICENSE` | 原样保留。 |
| `package-lock.json` | 删除；版本由单仓根 `package-lock.json` 统一锁定。 |
| `tsconfig.json` | 未改动（仍直接对真实上游源码做 typecheck）。 |

## 依赖的上游内部细节

- `@juicesharp/rpiv-todo` 默认导出 `(pi) => void`；工具名 `todo`（`TOOL_NAME`），操作枚举
  `create|update|list|get|delete|clear`，字段名/`required` 与上游 `TodoParamsSchema` 一致（仅去除
  `description` 文本）。
- 通过 `pi.registerTool` 拦截，`prepareArguments` 推断逻辑包装在原始 `prepareArguments` 之外。
- RPC 覆盖层直接使用 `@juicesharp/rpiv-todo/todo-overlay.js` 的 `TodoOverlay`，并读取/替换其
  `lastNextId`、`completedTaskIdsPendingHide`、`hiddenCompletedTaskIds`、`getSnapshot()`、
  `resetCompletedDisplayState()`、`setUICtx()`、`update()`、`isRegistered()`、`toggleCollapse()`、
  `dispose()`。
- 会话状态使用 `@juicesharp/rpiv-todo/state/store.js` 的 `sid`/`getState`/`replaceState`/`evictSession`
  与 `state/replay.js` 的 `replayFromBranch`。
- 事件与注册面：`session_start`、`tool_execution_end`、`session_compact`、`session_tree`、
  `session_shutdown`、`agent_start`；命令 `todos`；折叠快捷键。
- 2.13.5 新增：状态变更时写入 `appendEntry("rpiv-todo-state", details)`，回放优先使用该自定义条目
  （`STATE_ENTRY_TYPE`）。本包透传 `appendEntry`，无需适配。
- 2.13.5 起 `@juicesharp/rpiv-i18n` 为可选 peer，`index.ts` 动态导入其 `/loader`；缺失时回退英文。

## 升级步骤

1. `npm view @juicesharp/rpiv-todo version`，对比 2.12.0 基线与目标版本源码（`tool/types.ts`、
   `todo.ts`、`todo-overlay.ts`、`index.ts`、`state/*`）。
2. 更新两个工作区/根 `package.json` 中的精确依赖（含 `rpiv-i18n`），`npm install --ignore-scripts` 刷新 lockfile。
3. 检查是否有新 action/字段：如有，确认 `prepareTodoArguments` 的推断字段表与描述仍准确；检查
   `TodoOverlay` 的私有字段是否改名为 `#private`（会破坏覆盖层补丁）；检查 `STATE_ENTRY_TYPE` 与回放格式。
4. `npm run contracts` 重建快照，`npm test`、`npm run typecheck`、`npm run contracts:check`、
   `node scripts/verify-production-install.mjs`。
5. 更新本文件与 README 的版本号/字符代理数字；同步 `maintenance/manifest.json`。

## 已知限制

- RPC 覆盖层依赖上游 `TodoOverlay` 的非公开字段与方法；上游若改为真正 `#private` 或重命名，需要重写该适配。
- facade 的扁平 Schema 去除了全部字段描述，模型只能依赖字段名与枚举；如有歧义仍需 `action` 显式给出。
- i18n 语言包来自上游 `locales/`，本包不再单独固定其内容版本。
- 字符代理值 `ceil(chars / 4)` 只用于横向比较，不代表真实模型计费 token。
