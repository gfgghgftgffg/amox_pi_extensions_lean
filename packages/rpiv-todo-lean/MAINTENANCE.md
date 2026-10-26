# MAINTENANCE — rpiv-todo-lean

本文件记录本包与原 lean 基线的差异、锁定的上游版本、依赖的上游内部细节、升级步骤与已知限制。

历史审查中的“未运行”“待 CI”或人工审批要求只记录当时阶段，不代表当前 CI/发布结果或现行审批要求。当前自动合并与 OIDC 发布规则见[维护者文档](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md)。

## 来源与基线

- 上游扩展：`@juicesharp/rpiv-todo`（npm），作者 juicesharp，仓库
  <https://github.com/juicesharp/rpiv-mono>（`packages/rpiv-todo`），MIT。
- 本包代码基线：kunkun9527 的 lean 仓库 <https://github.com/kunkun9527/rpiv-todo-lean>，
  基线 commit `ec463cd90fbae962122fff2e0619955a8f17df1a`（tracked 文件整体复制，未复制上游代码）。
- 机器可读记录：仓库根 `maintenance/manifest.json`（`id: rpiv-todo-lean`）。

## 锁定的上游版本

- `@juicesharp/rpiv-todo@2.15.0`（精确固定；`dependencies`；此前为 2.13.9）。
- `@juicesharp/rpiv-i18n@2.15.0`（精确固定；上游仍为可选 peer，保留安装以维持本地化 UI）。
- 上游 2.15.0 自带传递依赖 `@juicesharp/rpiv-config@^2.15.0`（此前为 ^2.13.9；由 npm 解析，不显式固定）。
- Pi 宿主 peer：`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`
  均为 `>=1.1.0`，`typebox` 为 `*`。
- 开发/测试依赖：Pi 1.1.0、typebox 1.3.36、jiti 2.7.0、TypeScript 7.0.2
  （此前为 typebox 1.3.27 / TypeScript 5.9.3）。

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

## 本次 lean-only 审查：基准环境文档更新

- 精确作者 before/after：`6c748317321725563c803504283f0f036de385e3` →
  `50e485d82809009213e21c93c564f4eaf33a650c`。完整对比 index.ts、package.json 和中英文 README；
  入口及包元数据一致，README 仅将测量环境 Pi 1.2.0 改为 1.3.0，数值未变。
- 无工具、参数、默认值或行为变化；schema 去描述、action 推断和 RPC overlay 内部依赖继续适用。
  withHostPlan 在两版均已存在，先前不复用该输出扩展的决定保留；本地 stale guard 与命令等待不变。
- todo/i18n 仍为 2.13.8 / `afc21bc25f7d07cae9fb3103dc309240a16b9f49`；远端
  `fc951b8d2628ccbd5dc706d07df329e85daf1edd` 未采用。本次库存仅有 lean 源码，不声称重审远端引擎。
- 不复制作者基准或改变宿主要求；本仓字符代理由 check 重新捕获，不宣称已验证 Pi 1.3。
  无门面变化，不新增测试；check 实际执行既有回归、契约、类型、生产安装与审计，结果以输出为准。

## 本次审查：2.13.8 → 2.13.9

- 发布源码 `afc21bc25f7d07cae9fb3103dc309240a16b9f49` →
  `54df50eea935fc9753edc300d5f23c5e28d906d7`，todo 与相关 i18n 同步。远端
  `d3c6f0812140605a4e55e0a660eb83edc12abbc5` 不是本次采用源码；lean 作者仍为
  `50e485d82809009213e21c93c564f4eaf33a650c`，无新差异可复用。
- 对比两包 CHANGELOG、todo package.json、index.ts、tool/types.ts、state/store.ts、state/replay.ts、
  todo-overlay.ts 与 i18n index.ts：本次相关源码变化为相对导入从不存在的 .js 改到发布的 .ts 文件，
  避免 jiti fallback resolution；不是运行时逻辑重写。rpiv-config 传递范围升为 ^2.13.9，peer 不变；
  库存未包含 config 本体，不宣称审查了其全部实现。
- 工具仍为 todo，六个 action、字段／required 未变；create 默认 pending，list 默认不含 deleted、
  clear 重置 nextId=1。state entry 仍为 rpiv-todo-state，优先回放逻辑与 session map 未变。
  overlay 依赖的普通 private 字段 lastNextId／两个 completed 集合、getSnapshot 以及公开方法继续可用。
- 最小适配：本地 index.ts 四个深层 import 同步为 .ts，直接命中真实发布文件；默认包入口不变。
  schema 去描述、action 推断、RPC 会话隔离、stale guards、异步命令等待和原始响应委派不变。
  已有 tests 中 .js 路径与全部断言保留，真实集成回归同时验证与新 .ts 入口共享状态；不增加重复引擎测试。
- README 两种语言更新当前版本，字符代理由 check 重测。check 实际执行类型／既有任务与 RPC 回归、
  契约、独立生产安装与审计，结果以输出为准；不宣称测量了启动耗时改善。

## 本次 lean 作者审查：保持最小兼容更新

- 精确作者入口 `50e485d82809009213e21c93c564f4eaf33a650c` →
  `f1e3fc7bcde2644a89803fa6a3a256fb7422d89f` 完整比较：四个深层导入 .js → .ts，本仓上一轮已适配；
  新增 bare id（仅允许附带 includeDeleted）推断 get；prompt 改为逐步开始／完成、禁止最后批量标记。
- 后两项是可选输入容错与更强的工作流指导，不是当前固定引擎兼容所需，本次不复用。保留现有
  create/update 推断、显式 action=get、单一 in_progress 指导、RPC 会话／stale guards 与异步命令等待。
  作者原有 withHostPlan 仍未修复 await 后 stale getter，不复用的历史决定继续适用。
- 作者 wrapper 测试新增 bare id 推断／幂等／不推断破坏性操作断言，只对应未采用的功能，不复制。
  package.json 包装 2.13.10 → 2.13.12、todo/i18n pins 2.13.8 → 2.13.9，本仓已固定 2.13.9；
  README 更新版本、字符代理及新推断／指导用法，不复制其 Pi 1.3 基准、锁文件或包装版本。
- 引擎稳定版仍为 `54df50eea935fc9753edc300d5f23c5e28d906d7`，远端
  `d3c6f0812140605a4e55e0a660eb83edc12abbc5` 未采用。本次库存仅有 lean before/after，不声称
  重审未提供的引擎源码。六个 action、默认值与内部 overlay/store 依赖由现有真实集成验证。
- 本次无门面改动，不加重复回归。check 运行现有全部断言并更新本仓字符代理，结果以其输出为准。

## 本次审查：2.13.9 → 2.15.0

- 精确源码来自 sources.json：`54df50eea935fc9753edc300d5f23c5e28d906d7` →
  `ce6d3530410812ca504ec294995581a52170f9e1`，同时包含相关 i18n；远端
  `46dbdfd78ab631bbf3ce41c2618bb173a5ec2725` 未采用。三个 lean 作者 HEAD 均未变，
  没有本次作者新实现可复用，既往复用决定保留。web 0.44.0、subagents 0.22.0 不变，
  库存没有其 before/after，不声称审查未发布远端源码。
- 对比 todo 两版 CHANGELOG、package.json、index.ts、todo.ts、tool/types.ts、state/state-reducer.ts、
  tool/response-envelope.ts、state/replay.ts、view/format.ts、todo-overlay.ts、state/store.ts、config.ts、
  state/i18n-bridge.ts；阅读新增 tool/normalize-params.ts。相关 i18n 的 CHANGELOG 新节为空，
  package.json 更新版本及 config 范围；对比 index.ts 与 loader.ts，无相关接口变化。
  rpiv-config 本体不在库存，不声称审查其实现，实际安装由 check 验证。
- 工具仍仅 todo，六个 action 和 required=[action] 不变。新增可选 tasks 数组，项必填 subject，
  可选 description/activeForm/blockedBy/owner/metadata。顶层仍保留原字段；create 默认 pending、
  list 默认不含 deleted、clear 重置 nextId=1 均不变。复制原生 schema 后压缩，保留 tasks 的完整嵌套结构
  和名为 description 的实际输入字段，不再原地改动上游 schema。字符串 enum 的 type 与无限制 metadata
  的空 patternProperties 等价冗余项被删除；其余字段、枚举、required、类型与约束保留。
- create 接受 subject 或非空 tasks 二选一；批量五个 per-task 字段只能放在项内，先完整验证再提交，
  禁止引用同批新 ID，允许引用已有未删除任务。原单个创建仍可用。Reducer create op 从 taskId 改为
  taskIds 数组，本包装不读该 op；content 每项一行 Created，details 仍为全量 tasks/nextId 快照，
  成功整批追加一次 rpiv-todo-state，失败不追加，错误在 details.error 和文本中（不新增 isError）。
- 上游首次注册 prepareArguments，解码字符串 tasks 数组和字符串对象项，非法 JSON 保留原值供校验报错。
  本仓已有 hook-first 委派，之后才做旧 create/update 推断；本次不扩大 action 推断，批量须显式 action。
  常驻描述明确 subject 或 tasks[]，单行指南保留原有多步任务、单个 in_progress、及时完成、变更字段、
  筛选、清空和依赖增删规则；批量原子性与各项约束在 README 说明并由上游验证。
  不扩大 action 推断，不引入作者旧版 withHostPlan，也不复制 reducer 或归一化实现。
- view/format 在无 action 时不显示 undefined，批量调用卡显示数量；renderResult 检测 details.error 或宿主
  context.isError，以 ✗ 和首行错误取代成功状态。模型收到的错误 envelope 不变，由已有 render hook 委派承接。
- replay 现在检查每项的安全整数 id、subject/status、可选文本、blockedBy 与 metadata 形状及安全整数 nextId；
  损坏快照整条跳过，保留最近有效快照；自定义条目优先、历史 toolResult 回放和快照浅拷贝规则不变。
  RPC 的 session_start/compact/tree 均调用同一 replay，因此承接修复。
- index.ts、todo-overlay.ts、state/store.ts、config.ts 与 bridge 的已审查接口不变。依赖的普通 private
  字段／getSnapshot、公开方法、会话函数、事件／命令／快捷键继续成立，stale guard 与异步命令等待保留。
- tests/upstream-215-regression.test.mjs 使用真实 facade 覆盖完整批量字段、双重 JSON 归一化、批量
  成功／原子拒绝／已有依赖、一次持久化、RPC 生命周期损坏快照回放与 render 委派。新增 schema 等价
  校验，比较有效及无效输入在原生与压缩 schema 下的结果，并确认原生 schema 不被改动。
- 维护者已明确批准更新 wrapper.test.mjs 中两处过时契约期望：当前描述与新增 tasks 字段。
  所有原行为断言和 metadata<=1200 上限保持不变；不隐藏新参数、不按测试切换行为。
  fixture 使用 jiti moduleCache=true 共享真实状态图，避免 reset/read 另一份 store。
- 固定 check 重新捕获契约、字符代理并实际执行类型／测试、生产安装和审计，结果以检查日志为准。
  字符代理 ceil(chars/4) 非计费 token；交互式终端与三平台验收仍由后续流程分别确认。

## 本次 lean-only 审查：作者同步 2.15.0

- 精确作者 before/after：`f1e3fc7bcde2644a89803fa6a3a256fb7422d89f` →
  `664409f1e91e7eb8375cb0e473321a7075f20de1`，以 sources.json 为准。完整比较两版 index.ts、
  package.json、中英文 README、wrapper 和 rpc-sessions 测试，并阅读本地入口与当前用法。
- 入口唯一差异为指南增加 `or a tasks[] batch`。不是新 schema／action／默认值或执行逻辑；本地描述
  已有 `create subject or tasks[]`，完整批量 schema、hook-first 归一化及原子执行已由前次适配承接。
  不重复增加常驻文本；中英文 README 保留完整批量约束，并明确已有的单个 in_progress／及时完成指导。
- 作者 package.json 包装 2.13.12 → 2.15.0，todo/i18n pins 2.13.9 → 2.15.0；本仓已固定 2.15.0。
  peer/dev 不变，不复制作者包装版本、锁文件或开发依赖。README 更新依赖、测量表及 Pi 1.3 → 1.4，
  但 Versions 中包装版本和中文依赖仍残留旧值，package description 也保留旧代理；不复用这些数字。
  本仓版本由固定脚本管理，字符代理由 check 重测。
- 作者 wrapper 测试新增 tasks 字段期望，并把 metadata 上限 1200 放宽到 1500；本仓已有完整 tasks
  schema／真实执行回归，不复制重复期望，不放宽 1200 上限。rpc-sessions 两版完全一致。
- 历史未采用功能没有变化：bare id 推断、较强逐步 workflow 指令及 withHostPlan 仍不引入。
  withHostPlan 仍在 await 后读取 ctx.mode/sid，未增加 stale 防护；本地保留已有 stale guards、异步命令
  等待、逐会话覆盖层及原始响应，不替换为作者入口或原地修改上游 schema。
- 六个 action、完整字段、required=[action]、create=pending、list 默认不含 deleted、clear 重置 nextId=1
  不变；没有新的本地行为适配。依赖的 overlay/store/replay 接口由已有固定依赖真实集成回归验证。
- 本次没有引擎 before/after／CHANGELOG，todo/i18n 稳定版仍为 2.15.0 /
  `ce6d3530410812ca504ec294995581a52170f9e1`；远端 `46dbdfd78ab631bbf3ce41c2618bb173a5ec2725`
  未采用，不声称重审该远端源码。subagents 引擎 0.22.0 与 lean HEAD 均不变，无本次快照或复用变动。
- 本次无门面行为变化，不加重复测试或修改既有断言。check 实际执行类型／既有回归／契约、三包独立
  生产安装和两种审计，并重测字符代理；结果以其输出为准。ceil(chars/4) 非计费 token，Pi 1.4 与交互 UI 未实测。

## 升级步骤

1. `npm view @juicesharp/rpiv-todo version` 确认目标稳定版本，对比 manifest 中当前固定版本/revision 与目标源码（`tool/types.ts`、`todo.ts`、`todo-overlay.ts`、`index.ts`、`state/*`）及 `CHANGELOG.md`。
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
