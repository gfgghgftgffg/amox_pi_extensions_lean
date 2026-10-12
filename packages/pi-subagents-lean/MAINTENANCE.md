# MAINTENANCE — pi-subagents-lean

本文件记录本包与原 lean 基线的差异、锁定的上游版本、依赖的上游内部细节、升级步骤与已知限制。

## 来源与基线

- 上游扩展：`@tintinweb/pi-subagents`（npm），作者 tintinweb，仓库
  <https://github.com/tintinweb/pi-subagents>，MIT。
- 本包代码基线：kunkun9527 的 lean 仓库 <https://github.com/kunkun9527/pi-subagents-lean>，
  基线 commit `83f1454b26c32dd2a674385df55955ac9d3a45c3`（tracked 文件整体复制，未复制上游代码）。
- 机器可读记录：仓库根 `maintenance/manifest.json`（`id: pi-subagents-lean`）。

## 锁定的上游版本

- `@tintinweb/pi-subagents@0.21.0`（精确固定；`dependencies`；此前为 0.20.0）。
- 0.21.0 沿用 0.20.0 的 Pi `>=1.1.0` 与 `typebox` v1 `*` peer；
  `@sinclair/typebox` 不是上游运行时依赖（上游开发依赖仍列有它）。
- Pi 宿主 peer：`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`
  均为 `>=1.1.0`，`typebox` 为 `*`。
- 当前候选开发/测试依赖：Pi 1.1.0、typebox 1.3.36、jiti 2.7.0、TypeScript 7.0.2
  （由规划阶段暂存，独立任务验证；此前为 typebox 1.3.27 / TypeScript 5.9.3）。

## 相对基线的精确改动（最小适配）

| 位置 | 改动 |
| --- | --- |
| `index.ts` | ① 校验库从 `@sinclair/typebox` 换成宿主提供的 `typebox` v1（`Type` 来自 `typebox`，`Value` 来自 `typebox/value`）——上游 0.20.0 的 Schema 由 typebox v1 构建，旧校验器不受支持。② 校验错误位置字段从 `error.path` 改为 v1 的 `error.instancePath`。③ 把 `subagent_type` 的回退描述提取为 `FALLBACK_SUBAGENT_TYPE_DESCRIPTION` 常量，供静态 Schema 与动态 Schema 共用（文案不变）。其余代码与基线一致。 |
| `tests/facade.test.mjs` | 原有 11 个测试与断言全部保留；把构造假 Schema 的 `Type` 导入从 `@sinclair/typebox` 改为 `typebox`，并在顶部增加 `PI_CODING_AGENT_DIR`/session 目录隔离（避免真实上游运行时读取宿主配置）。 |
| `tests/upstream-integration.test.mjs`（新增） | 加载真实 0.20.0 运行时的测试：help 暴露 Agent/helper/Workflow 当前 Schema、`subagent_type` 名单解析、真实 `get_subagent_result` 无副作用执行、真实 Schema 校验拒绝非法参数。 |
| `package.json` | 改名 `@gfgghgftgffg/pi-subagents-lean`、版本 `0.1.0`、仓库 `directory`、contributors 归属上游作者、依赖升级到 0.20.0、peer 下限改 1.1.0、devDeps 改为 typebox 1.3.27；新增 `MAINTENANCE.md` 到 `files`。 |
| `README*.md` | 重写为单仓说明、重新测量的字符代理数据与新版本号。 |
| `LICENSE` | 原样保留。 |
| `package-lock.json` | 删除；版本由单仓根 `package-lock.json` 统一锁定。 |
| `tsconfig.json`、`tests/types/pi-subagents.d.ts` | 未改动（上游源码仍用本地 stub 类型做 typecheck）。 |

## 依赖的上游内部细节

- 入口 `@tintinweb/pi-subagents/src/index.ts` 默认导出扩展函数；工具名 `Agent`、`get_subagent_result`、
  `steer_subagent`、`SubagentWorkflow`，执行签名 `execute(callId, params, signal, onUpdate, ctx)`。
- 从 `Agent.parameters.properties.subagent_type.description` 用正则解析启动时的可用类型列表：
  `The type of specialized agent to use. Available types: <list>. Custom agents from ... are also available.`
  0.20.0 该参数描述不随 `toolDescriptionMode`（full/compact/custom）变化；无法解析时回退到
  `help` 提示文案。
- 上游用 `withUsageReporting` 包装 `execute`，facade 捕获的是包装后的工具对象；透传调用即可。
- 高级参数以 JSON 放入 `input`，直接字段优先；调用前用上游真实 Schema 做 `Value.Errors` 校验。
- `renderCall`/`renderResult` 直接委托上游工具，保持原卡片渲染。
- 上游在 `session_start` 可能因 workflow 冲突调用 `setActiveTools`（仅移除 `SubagentWorkflow`），facade
  未拦截该调用；因 facade 工具名不同，不会影响 `subagent`。
- 上游 0.20.0 的 typebox v1 `Value.Errors` 使用 `instancePath`（旧版为 `path`）。

## 本次审查：0.20.0 → 0.21.0

- 审查 npm 发布源码：`13106ab6f608b3acc54185da5299ee7fbaabb6b9` →
  `26c23bb7db7b181ff3f4233cdc4e5bc9fefb6f04`，不是远端 HEAD
  `e819a82ae364a2b0432881b89b0c784b413a88c1`。依据为收集的 `sources.json`、新旧
  `package.json` / `CHANGELOG.md` 与下述源码。
- 新旧 `src/index.ts` 的四个工具名、参数类型、required、条件注册、五参数执行签名与渲染签名
  不变。`Agent` 的 `subagent_type` 描述格式仍可解析；未新增 `prepareArguments`。
  `withUsageReporting` 仍在注册前包装执行，facade 捕获并透传这个对象。
- 参数面：`run` 为 prompt/description/subagent_type（必填），name/model/thinking/max_turns/
  run_in_background/resume/isolated/inherit_context（可选），isolation/schedule（按设置加入）；
  `result` 为 agent_id + wait/verbose；`steer` 为 agent_id/message；`workflow` 为
  script/scriptPath/name/args/resumeFromRunId/title/description。没有新增或删除。
- 默认值不变：顶层默认后台，inherit_context=false，wait/verbose=false，isolation 默认 off；
  `src/invocation-config.ts` 的 frontmatter 优先级和 schema 完全一致。
- 行为变化由依赖承接：后台 agent/group/workflow 通知从 followUp 改为 steer，在忙碌父会话当前
  工具批次结束后、下一次模型调用前到达；不打断正在执行的工具。前台新 spawn 可用 ctrl+b
  （编辑器焦点下全部）或 viewer 的 b（单个）转后台，返回后台 ID 并继续运行。
- `src/workflow/host.ts` 现在透传 agent 文件的 isolated；`src/agent-runner.ts` 统一使用
  agentConfig.isolated ?? options.isolated；`src/agent-manager.ts` 统一采用文件 isolation，
  workflow 子任务除外（仍由脚本决定 worktree）。因此 mention/RPC 文件指定 worktree 在非 git
  目录现在启动失败，文件 false/off 也能否决 caller 的设置。
- 子会话现在装载宿主的 builtin:codemode/tool-search/mcp；extensions=true 会各自启动 MCP
  服务器，可用 exclude_extensions: builtin:mcp、全局 -builtin:mcp 或 --no-mcp 禁用。
  子会话继承父会话项目 trust；跨目录 spawn 的 cwd 不自动获得 trust。
- 子工具作用域尊重 exposure/defaultActive，允许显式或 tool_search 激活的范围内工具；
  ctx.executeTool 的嵌套调用也经过作用域检查。全屏 viewer、滚轮/滚动条和 FleetView 修复仍由上游渲染。
- 最小适配结论：`index.ts` 前后完全相同，保留 prompt/schema/execute 与单一 subagent 工具。
  高级字段仍由 input/help 暴露。现有“完成时通知、不轮询”描述与新行为一致，不需要加长 prompt。
  lean 作者 commit 前后同为 `83f1454b26c32dd2a674385df55955ac9d3a45c3`，无新改动可复用或拒绝。
- 新增 `tests/upstream-021-regression.test.mjs`：facade 对前台 handoff update、后台结果（含 usage）
  和 steering 通知的完整透传及工具名稳定；真实上游作用域函数的 exposure/defaultActive、
  延迟注册、激活保留、直接调用 veto 与 nested gate；真实 workflow host 的 isolated 三态透传
  和脚本 worktree 优先规则。所有既有测试与断言保留；旧测试名称中的 0.20.0 为原始编写基线，
  实际加载 package.json 中固定的当前版本。
- 本阶段未运行安装、测试、契约捕获或字符统计。README 表格保留 0.20.0 历史测量并标明基线，
  新测量与包装版本由独立验证任务同步；manifest 的目标版本/revision 已由规划阶段暂存。
  独立任务须运行 npm ci、npm run check、npm run contracts、npm run contracts:check 与
  node scripts/verify-production-install.mjs。交互式 ctrl+b、真实 MCP/provider 与 trust 端到端
  行为未在本阶段实测；新增测试覆盖的是无凭据内部边界，不能替代这些场景。

## 升级步骤

1. `npm view @tintinweb/pi-subagents version`，阅读上游 `CHANGELOG.md`，对比 0.19.0 基线源码。
2. 更新根与工作区 `package.json` 的精确依赖与 peer 下限，`npm install --ignore-scripts` 刷新 lockfile。
3. 核对：工具名是否变化、`subagent_type` 描述格式是否变化、Schema 构建库是否仍为 typebox v1、
   `execute`/`renderCall`/`renderResult` 签名是否变化。仅版本变化时不需要改 `index.ts`。
4. `npm run contracts` 重建快照，`npm test`、`npm run typecheck`、`npm run contracts:check`、
   `node scripts/verify-production-install.mjs`。
5. 更新本文件与 README 的版本号/字符代理数字；同步 `maintenance/manifest.json`。

## 已知限制

- `Agent` 类型列表在扩展启动时解析一次；启动后新增/删除 agent 定义需要重新加载扩展。
- 上游若再次更换 Schema 构建库（如回到 `@sinclair/typebox`），需要同步切换本包校验导入。
- `workflowsEnabled: false` 在启动注册前生效时不捕获 `SubagentWorkflow`，`op: "workflow"` 返回不可用。
  会话启动时的冲突退出仍只尝试从宿主激活集移除原工具名；facade 捕获的对象保持不变，
  不应把这种退出描述为 facade 工具被注销。
- 字符代理值 `ceil(chars / 4)` 只用于横向比较，不代表真实模型计费 token。
