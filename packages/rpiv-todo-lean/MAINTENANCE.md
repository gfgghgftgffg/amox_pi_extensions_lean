# MAINTENANCE — rpiv-todo-lean

本文件记录本包与原 lean 基线的差异、锁定的上游版本、依赖的上游内部细节、升级步骤与已知限制。

## 来源与基线

- 上游扩展：`@juicesharp/rpiv-todo`（npm），作者 juicesharp，仓库
  <https://github.com/juicesharp/rpiv-mono>（`packages/rpiv-todo`），MIT。
- 本包代码基线：kunkun9527 的 lean 仓库 <https://github.com/kunkun9527/rpiv-todo-lean>，
  基线 commit `ec463cd90fbae962122fff2e0619955a8f17df1a`（tracked 文件整体复制，未复制上游代码）。
- 机器可读记录：仓库根 `maintenance/manifest.json`（`id: rpiv-todo-lean`）。

## 锁定的上游版本

- `@juicesharp/rpiv-todo@2.13.8`（精确固定；`dependencies`；此前为 2.13.5）。
- `@juicesharp/rpiv-i18n@2.13.8`（精确固定；上游仍为可选 peer，保留安装以维持本地化 UI）。
- 上游 2.13.8 自带传递依赖 `@juicesharp/rpiv-config@^2.13.8`（此前为 ^2.13.5；由 npm 解析，不显式固定）。
- Pi 宿主 peer：`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`
  均为 `>=1.1.0`，`typebox` 为 `*`。
- 当前候选开发/测试依赖：Pi 1.1.0、typebox 1.3.36、jiti 2.7.0、TypeScript 7.0.2
  （由规划阶段暂存，独立任务验证；此前为 typebox 1.3.27 / TypeScript 5.9.3）。

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

## 本次审查：2.13.5 → 2.13.8

- 审查 npm 发布源码（含相关 rpiv-i18n 目录）：
  `e516242c51adace38b8dd0a3c70495d24a6e9b79` →
  `afc21bc25f7d07cae9fb3103dc309240a16b9f49`，不是远端 HEAD
  `2d88b79c08ce19ffeecbe85d5ee1071046b708c0`。依据为收集的 `sources.json`、新旧
  `package.json`、两个包的 CHANGELOG 和下述新旧源码。
- CHANGELOG 的 2.13.6/7/8 均为空条目；核对 `tool/types.ts`、`todo.ts`、`index.ts`、
  `todo-overlay.ts`、`config.ts`、`state/store.ts`、`state/replay.ts`、
  `state/state-reducer.ts`、`state/i18n-bridge.ts`，这些审查面源码一致。
- 工具仍只有 todo；action 为 create/update/list/get/delete/clear。字段仍为 action、
  subject、description、activeForm、status、blockedBy、addBlockedBy、removeBlockedBy、
  owner、metadata、id、includeDeleted。required 仍为 action；create 默认 pending，
  list 默认 includeDeleted=false，clear 重置 nextId=1。没有新增/删除工具或参数、默认值变化。
- 执行仍为 execute(callId, params, signal, onUpdate, ctx)。真实上游工具仍没有
  prepareArguments；facade 的可选 hook 委派与缺省 action 推断继续成立，原始 hook 返回后
  才做本地推断。原地去 description 不改变字段、枚举或 required。
- 覆盖层 lastNextId、completedTaskIdsPendingHide、hiddenCompletedTaskIds、getSnapshot
  仍为普通 TypeScript private 而非 #private；全部依赖的方法、会话 store 函数、事件、
  /todos 命令与折叠快捷键保持不变。持久化条目仍为 rpiv-todo-state，回放仍优先使用这些
  自定义条目，无条目时兼容历史 todo toolResult。
- 相关 i18n 的 index.ts、loader.ts 和 todo 的 bridge 不变：registerLocalesFromDir 从
  调用包的 locales 加载；scope 在 render 时读取当前语言；缺失 SDK 回退英文。
  config.ts 对 rpiv-config 的调用签名未变；本次源码材料未包含 rpiv-config 本体，
  传递依赖的安装与真实配置行为仍须由独立验证覆盖。
- 最小适配结论：仅消费规划阶段暂存的 todo/i18n 精确版本；`index.ts` 前后完全相同，
  不改 schema、prompt、execute、RPC 会话补丁或工具身份。lean 作者 commit 前后同为
  `ec463cd90fbae962122fff2e0619955a8f17df1a`，无新作者改动可复用或拒绝。
- 没有改变 API/行为，因此没有增加重复实现的测试；所有既有 schema、reducer、持久化、
  RPC 隔离和 stale ctx 断言保留。测试名称中的 2.13.5 是原始编写基线，实际加载当前固定版本。
- 本阶段未运行 npm ci、npm run check、npm run contracts、npm run contracts:check、
  node scripts/verify-production-install.mjs 或字符统计。README 保留 2.13.5 历史测量并标明
  基线；独立任务生成新统计/快照/包装版本，manifest 的目标版本/revision 已由规划阶段暂存。

## 本次 lean 作者更新审查（引擎仍为 2.13.8）

- 精确作者入口：`ec463cd90fbae962122fff2e0619955a8f17df1a` →
  `6c748317321725563c803504283f0f036de385e3`，两版 index.ts 完整阅读并与本地入口比较。
- 唯一新增执行功能为 withHostPlan：RPC create/update/delete 后读取 getState(sid(ctx))，
  把 pending/in_progress/completed 的全量快照追加为 Plan checklist；过滤 deleted，空列表不追加。
  clear 不在触发集合内；所有 RPC host 都会收到这些模型可见 content 文本，不仅 Codex Desktop。
  本次不复用这项 host 专用输出扩展：它不是当前依赖兼容所需，且新增的 await 后 ctx.mode/sid 读取
  未防失效上下文。本地保留既有 Pi 1.1 stale guard、异步命令等待和原始结果委派。
- 原有 schema 去描述、action 推断、RPC session map、overlay 私有字段访问、事件／命令逻辑在
  作者两版入口中未变；本地已有更完整 stale 修复，不整体替换作者入口。无工具／字段／默认值变化。
- 审查作者 package.json：2.12.1 → 2.13.10，todo/i18n pins → 2.13.8；这些引擎 pins 本仓已有。
  作者移除 files 中中文 README、改用 README_zh-CN.md、增加 RPC host plan 文档与更新 Pi 1.2
  字符代理，不复用其打包清单、包装版本、锁文件或测量。阅读作者 wrapper 测试，已有 schema/
  action/envelope/预算断言由本仓基线保留，不引入重复测试。
- npm stable gitHead 仍为 `afc21bc25f7d07cae9fb3103dc309240a16b9f49`，较新远端
  `1ffa165c224b5489fb5774a6652ef2e1c3bc6b2a` 不替代发布源码。本次库存没有 todo 引擎
  before/after，故不声称重审了远端引擎；已记录的内部依赖由当前 pin 与既有真实集成回归验证。
- check 执行本候选类型／测试／契约、生产安装、审计与字符代理；结果以工具输出为准，历史未运行
  说明仅对应历史阶段。没有本次门面变化，不新增 todo 测试。

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
