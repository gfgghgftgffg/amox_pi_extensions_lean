# MAINTENANCE — pi-subagents-lean

本文件记录本包与原 lean 基线的差异、锁定的上游版本、依赖的上游内部细节、升级步骤与已知限制。

## 来源与基线

- 上游扩展：`@tintinweb/pi-subagents`（npm），作者 tintinweb，仓库
  <https://github.com/tintinweb/pi-subagents>，MIT。
- 本包代码基线：kunkun9527 的 lean 仓库 <https://github.com/kunkun9527/pi-subagents-lean>，
  基线 commit `83f1454b26c32dd2a674385df55955ac9d3a45c3`（tracked 文件整体复制，未复制上游代码）。
- 机器可读记录：仓库根 `maintenance/manifest.json`（`id: pi-subagents-lean`）。

## 锁定的上游版本

- `@tintinweb/pi-subagents@0.20.0`（精确固定；`dependencies`）。
- 0.20.0 要求 Pi `>=1.1.0`（上游 peer 下限从 0.84 提升），并把 `typebox` v1 作为 `*` peer；
  `@sinclair/typebox` 已从上游依赖中移除。
- Pi 宿主 peer：`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`
  均为 `>=1.1.0`，`typebox` 为 `*`。
- 开发/测试依赖：Pi 1.1.0、typebox 1.3.27、jiti 2.7.0、TypeScript 5.9.3（不再使用 @sinclair/typebox）。

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
- `workflowsEnabled: false` 或冲突退出时上游不注册 `SubagentWorkflow`，此时 `op: "workflow"` 返回不可用。
- 字符代理值 `ceil(chars / 4)` 只用于横向比较，不代表真实模型计费 token。
