# 本次 lean 门面升级审查

## 结论与权限边界

已审查必须处理的 `pi-subagents-lean` 与 `rpiv-todo-lean`。最小适配结论是两个 `index.ts` 均无需修改：工具名称、参数 Schema、执行签名与现有委派边界兼容目标稳定版。subagents 的运行时行为变化由固定 npm 依赖承接，补充包文档并新增三个回归测试；todo 的审查面源码一致，保留原有测试。没有删除规则、重新合并工具或改变工具身份的提案。

本报告的 ready 表示适配提案可交给独立验证任务，不代表测试通过、可以合并或可以发布。此阶段仅使用提供的文件工具；未运行任何安装、测试、契约捕获、字符统计、生产安装或发布命令。人工确认仍是合并／发版的前置条件。上游注释与 CHANGELOG 仅作为数据阅读，没有执行或遵循其中的指令。没有复制上游运行时代码。

## 精确来源

源码 revision 以提供的 `upstream/sources.json` 为准，目标选择以规划器给出的 npm latest stable 为准，未把较新的远端 Git HEAD 当成稳定发布。

| 包 | 旧版本／收集 revision | 新稳定版／收集 revision | 未采用的远端 HEAD |
| --- | --- | --- | --- |
| pi-subagents | 0.20.0 / `13106ab6f608b3acc54185da5299ee7fbaabb6b9` | 0.21.0 / `26c23bb7db7b181ff3f4233cdc4e5bc9fefb6f04` | `e819a82ae364a2b0432881b89b0c784b413a88c1` |
| rpiv-todo，含相关 rpiv-i18n 目录 | 2.13.5 / `e516242c51adace38b8dd0a3c70495d24a6e9b79` | 2.13.8 / `afc21bc25f7d07cae9fb3103dc309240a16b9f49` | `2d88b79c08ce19ffeecbe85d5ee1071046b708c0` |
| pi-web-access | 0.39.0，规划器记录 `8e812826269624406458531f9231b679547f5a3a` | 同版本／同 revision | 无差异 |

读取了两包 MAINTENANCE.md 后才审查其适配源码。两包本地 lean `index.ts` 修改前及最终版本均完整读取；本次未写入入口，因此旧／新适配源码相同。也读取了包的中英文 README、package.json、根 README、manifest 与既有 subagents facade／integration、todo integration 测试，新增测试写入后再次完整读取做静态复核。

原 lean 作者来源由规划器确认没有变化：

- pi-subagents-lean：currentCommit = remoteHead = `83f1454b26c32dd2a674385df55955ac9d3a45c3`。
- rpiv-todo-lean：currentCommit = remoteHead = `ec463cd90fbae962122fff2e0619955a8f17df1a`。
- pi-web-access-lean：currentCommit = remoteHead = `db083e9119fe5cf080d2ee8d61ef58349042239b`。

库存没有独立的 lean-author before/after 拷贝；这里没有声称读取了不存在的作者候选源码。作者 revision 前后一致，本次没有新作者差异可复用或拒绝，也没有整仓覆盖。保留本仓已有的 typebox v1、schema 校验、collapsed display、RPC 会话隔离与 stale ctx 适配。

## pi-subagents-lean：API 与内部细节

阅读两个版本的 CHANGELOG 与 package.json，并核对 `src/index.ts` 中 Agent、workflow、result、steer 的注册／Schema／执行／渲染／usage 包装，以及 workflow collision 路径；核对新旧 `src/invocation-config.ts`、`src/workflow/host.ts`、`src/agent-runner.ts` 的作用域／隔离／loader 段和 `src/agent-manager.ts` 的派生与 worktree 段。补读目标 `src/agent-types.ts`、`src/model-scope.ts`，用于设计无凭据的真实函数边界测试。

| 操作 | 上游工具 | 参数与约束（新旧相同） |
| --- | --- | --- |
| run | Agent | 必填 prompt、description、subagent_type；可选 name、model、thinking、max_turns（minimum=1）、run_in_background、resume、isolated、inherit_context；按启动设置加入 isolation（off/worktree）与 schedule |
| result | get_subagent_result | 必填 agent_id；可选 wait、verbose，默认 false |
| steer | steer_subagent | 必填 agent_id、message |
| workflow | SubagentWorkflow | 可选 script（maxLength=524288）、scriptPath、name、args、resumeFromRunId（保留 wf_ pattern）、title、description；来源选择仍由执行逻辑处理 |

- 新增工具：无。删除工具：无。新增／删除参数：无。类型、required、约束、默认值：未变。
- 执行签名仍为 `execute(callId, params, signal, onUpdate, ctx)`，renderCall/renderResult 继续接收原来的参数／context。两个版本的注册工具均没有 prepareArguments hook。
- Agent 的可用类型描述仍采用 `The type of specialized agent to use. Available types: ... . Custom agents from ... are also available.` 模板，且独立于 full/compact/custom 描述模式。本地正则、一次性启动名单与无法解析时的 help 回退成立。
- `withUsageReporting` 仍在注册前包装 execute；捕获的是这个工具对象，usage 和 result 继续原样透传。
- 高级 JSON 和直接字段的合并顺序、真实上游 `Value.Errors` 校验、instancePath 错误定位不变。Pi peer 下限仍为 >=1.1.0、typebox 为 *；@sinclair/typebox 只出现在上游 devDependencies，未重新成为 runtime dependency。
- 本地 facade 的工具名为 subagent；没有动态新增／删除 facade 工具。上游 workflow collision 仍只在激活集包含原名 SubagentWorkflow 时移除原名，本地 facade 未拦截此 API 但名称不同，保持原行为。修正文档中把“注册前关闭”和“session_start 冲突退出”混为一谈的旧限制说明，没有改变 collision 策略。

### 0.21.0 行为变化与承接方式

1. 后台 agent、group、workflow 完成通知使用 steer，忙碌父会话在当前工具批次之后、下一模型调用之前收到，正在执行的工具不被打断。旧版本 workflow 通知代码用 followUp，新版本用 steer；CHANGELOG 同时说明 agent/group 的变化。facade 透传 sendMessage，不另建通知系统；现有 prompt 的“Background completion is notified; never poll or sleep”仍准确。
2. 新的前台 spawn handoff 使用 ctrl+b（编辑器焦点下全部运行的前台调用）或 viewer b（一个）；execute 返回后台结果／ID，子任务继续并通知完成。原来的 schema 不新增 handoff 参数；upstream 的 onUpdate、details.backgroundHint、后台结果与 usage 都能通过现有 execute/render 委派。
3. workflow host 新增 agent-file isolated 透传。runner 从 `agentConfig?.isolated ?? options.isolated` 决定隔离，对 mention、RPC、workflow 等路径保持文件优先；旧 runner 只看 options.isolated。
4. manager 从文件 isolation 解析普通 spawn，文件值可否决 RPC caller，mention/RPC 文件指定 worktree 在不可用 git 目录启动失败。workflowId 子任务仍只采用脚本选项，不继承文件 worktree。这和既有 Agent 工具的 frontmatter 优先级并不矛盾。
5. loader 装载 builtin:codemode、builtin:tool-search、builtin:mcp；extensions=true 子会话会启动自己的 MCP 服务。文档列出 per-agent exclude_extensions: builtin:mcp、全局 -builtin:mcp、--no-mcp 的退出方式。没有在 facade 复制 loader 或 MCP 代码。
6. runner 使用父 ctx.isProjectTrusted() 创建 SettingsManager；跨目录 spawn 的 session trust 为 false，配置发现仍来自父项目。未通过 facade 覆盖这个决定。
7. child scope 尊重 direct/model-only/codemode/deferred exposure 和 defaultActive；范围内已激活的 deferred 工具被保留，late registrations 会更新作用域。新增 nestedCallGate 与隐藏 tool_call guard 覆盖 ctx.executeTool 调用。本地注册主会话工具的列表不因此变动。
8. 全屏 conversation viewer、鼠标滚轮／滚动条／footer 控件、FleetView 留白及自定义编辑器焦点识别由上游 UI 承接。本地继续委派工具渲染与命令。

### 回归测试

新增 `packages/pi-subagents-lean/tests/upstream-021-regression.test.mjs`，保留所有原测试与断言：

- 注入小型上游注册边界，检查五参数 execute、onUpdate 的 handoff hint、后台结果对象及 usage、steer 通知选项完整透传，事件后仍只有 subagent。这是 facade 边界测试，不声称测试了 ctrl+b 按键或真实队列时序。
- 调用真实 0.21.0 installExtensionToolScope，以内存 session/loader 验证 deferred/codemode/defaultActive=false 不被初始主动暴露，范围外工具和顶层 Agent 被阻止，原 beforeToolCall 对合法调用仍执行，tool_search 激活的 deferred 工具保留，late model-only 注册可见，移出 scope 后 active 集和 nested gate 都拒绝。
- 调用真实 createWorkflowHost，用内存 manager 记录 spawnAndWait 参数，验证 isolated 的 true/false/undefined 三态、workflow ownership，文件 worktree 不渗入脚本未指定的请求，显式脚本 worktree 继续透传。

测试不调用模型、不启动 MCP、不执行 shell/git。所有测试均尚未运行，须独立任务执行。旧 integration 测试名称中的 0.20.0 为编写时版本，测试代码通过固定 npm 依赖加载当前版本，未删除或降低其断言。

## rpiv-todo-lean：API 与内部细节

阅读 todo 和相关 i18n 两个版本 CHANGELOG、todo 两个版本 package.json；完整核对新旧 `tool/types.ts`、`todo.ts`、`index.ts`、`todo-overlay.ts`、`config.ts`、`state/store.ts`、`state/replay.ts`、`state/state-reducer.ts`、`state/i18n-bridge.ts`，以及相关 i18n 的 `index.ts`、`loader.ts`、`i18n.ts`。以上审查面新旧文本一致。todo/i18n 的 2.13.6/7/8 CHANGELOG 为空条目，没有宣称新增功能。

- 新增／删除工具：无；工具仍为 todo，命令为 todos。
- action 仍为 create/update/list/get/delete/clear；status 为 pending/in_progress/completed/deleted。
- 完整 schema 字段：action、subject、description、activeForm、status、blockedBy、addBlockedBy、removeBlockedBy、owner、metadata、id、includeDeleted。required 仍仅为 action。无新参数、类型／默认值／约束改变。
- create 默认 pending；includeDeleted 默认 false；clear 重置 nextId=1。update 的 mutable 字段表与 facade 的 action 推断表仍对应；原 schema description 的去除没有丢失 task.description 属性。
- 执行仍为五参数形式。真实上游工具仍没有 prepareArguments；facade 可选上游 hook 返回后再做 action 推断的结构继续成立，无需增加新的归一化。
- 覆盖层仍使用普通 TS private：lastNextId、completedTaskIdsPendingHide、hiddenCompletedTaskIds、getSnapshot。resetCompletedDisplayState/setUICtx/update/isRegistered/toggleCollapse/dispose/hideCompletedTasksFromPreviousTurn 未变，没有 #private 改造。RPC 的 sessionId 绑定快照补丁继续可用。
- sid/getState/replaceState/evictSession/replayFromBranch 的签名、事件注册、异步 /todos 命令与 shortcut 不变。rpiv-todo-state 自定义条目与 TaskDetails 格式不变，entries 优先、无 entries 时使用 legacy todo toolResult。
- i18n registerLocalesFromDir/scope/tr/applyLocale/shared global runtime 不变；locale 集合、实时渲染查找与英文 fallback 不变。
- 可选 i18n peer 保持安装，todo/i18n 精确 pin 均到 2.13.8。todo 的传递 rpiv-config 范围从 ^2.13.5 变为 ^2.13.8；config.ts 的调用签名未变。收集材料没有 rpiv-config 本体，因此本报告不宣称审查其全部内部实现。

没有改变此包 API／行为或适配代码，因此没有添加重复现有实现的测试。保留所有已有 wrapper、RPC sessions、stale ctx 与真实 integration 断言，尤其不能因为升级导致失败就删断言。现有 integration 名称中的 2.13.5 是编写基线，实际读取当前 pin。

## 本阶段写入的文件

- 根 README.md：标明目标 pin、历史字符统计和独立验证状态。
- 两个升级包的 README.md、README.zh-CN.md：版本、实际审查行为、验证状态及历史测量说明。
- 两个升级包 MAINTENANCE.md：pin、当前已暂存开发依赖、来源 revision、参数/内部边界、适配结论和限制。
- pi-subagents-lean 新增 upstream-021-regression.test.mjs：三个回归测试。
- maintenance/agent-review.md：本报告。

两个 index.ts 均没有写入；pi-web-access-lean 在规划中版本／revision 都不变，读其 MAINTENANCE.md 确认锁定 0.39.0 后不作适配。未改任何 package.json、版本、依赖、manifest、lock、snapshot、CI、配置、脚本或 LICENSE。提供的 manifest 已暂存 todo 2.13.8 / subagents 0.21.0 与发布 revision，agent 只读取确认。

当前两包 package.json 的开发 pin 实际为 typebox 1.3.36 / TypeScript 7.0.2，与旧维护说明的 1.3.27 / 5.9.3 不同。它们是进入此阶段时已有的候选数据，文档如实记录，不把这项更改归于 agent，也不自行回滚。

## 验证、统计与未解决事项

待独立无凭据任务执行：npm ci、npm run check、npm run contracts、npm run contracts:check、node scripts/verify-production-install.mjs，并生成实际字符代理、快照和统一包装版本，同步最终 README／manifest。没有以 diagnostics/contract-diff.json 的 drift=false 作为本次新测试通过的证据，也没有模拟这些命令。

包 README 表格保留旧 subagents 0.20.0（lean 270 / upstream 8,415）与 todo 2.13.5（lean 247 / upstream 882）测量，明确为历史基线；没有把旧数字移到新版本名下。根 94.4% 同样标明来自此前已接受快照。最终候选统计只能来自独立捕获。

没有发现需要额外修改 facade 或需要人工决定删规则／合工具的源码兼容问题。以下是验证边界与发布前待办，不是已通过的检查：

- 新增测试尚未执行，完整类型／回归／契约／生产安装结果未知，失败必须停止并审查，不能弱化检查。
- 真实 provider、MCP server、trust、键盘／fullscreen viewer 及父会话通知调度的端到端行为未由本阶段实测；三个新测试只覆盖明确的离线边界。人工评审需特别注意“每子会话启动 MCP”、文件隔离优先和非 git worktree 启动失败这几项行为变化。
- rpiv-config 未提供源码，本报告仅核对直接调用面的稳定性；依赖安装与真实配置读取由既有回归／生产验证覆盖，不能将本报告解释为其所有语义经过源码审查。
- 原 lean 作者没有新的候选 revision，也没有独立作者源码拷贝；无作者改动复用／拒绝项。本仓本地适配入口的前／后版本已阅读且一致。

本次可以提交独立验证的适配提案；只有验证通过且人工确认后才能合并或发布。

## 独立验证后的 Windows 测试修复

原始 Actions 运行 `38301888492` 的 detect、adapt、Linux 和 macOS 验证成功；Windows 的新增 workflow 隔离测试失败，未创建更新 PR。这不属于本阶段尚未执行测试的结论，而是后续独立验证结果。

在隔离 Windows 工作树中复现后，确认 `jiti` 对测试直接导入的 `agent-types.ts` 和上游 host 导入的 `agent-types.js` 使用了不同路径分隔符的缓存键，产生两份注册表。将新增测试的导入改成与 host 一致的 `.js` 后，`Hermetic` 与 `isolated` 三态断言均通过，没有修改生产入口或删除断言。

修复后的本地检查：新增测试 3/3；完整类型检查与回归测试 158 项，154 通过、0 失败、4 项因本地文件符号链接权限跳过；契约检查、三个独立生产安装及两项安全审计通过，0 漏洞。修复版仍需新的三平台 CI，不把原始 Linux/macOS 的成功当成当前修复版全部验证完成的证据。本次复用现有提案，没有再次调用维护模型。
