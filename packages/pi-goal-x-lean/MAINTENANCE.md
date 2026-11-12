# Maintenance boundary

The original facade depends on exact `pi-goal-x@0.34.1`; it does not copy the engine. The published package has no npm publication `gitHead`, so maintenance reviews exact npm tarballs with SHA-512 integrity, not an inferred Git commit. There is no external lean-author repository. Pi development verification uses 1.4.0; supported hosts must satisfy upstream peers (`>=1.4.0 <2.0.0`).

## Retained behavior

Keep all eight upstream tool names, schemas except description annotations, prompt guidelines, lifecycle hooks, commands, shortcuts, renderers and tool profiles. Do not suppress `setActiveTools`, collapse names or truncate goal context: stopped-turn gates, progress classification, drafting, live-tail retention and provider-cache placement depend on them. Unknown new tools pass through unchanged until reviewed.

## Integration contracts

The optional `@gfgghgftgffg/pi-subagents-lean.context.v1` global service supplies the actual dist runner's AsyncLocalStorage child flag. Never copy child-context state, resolve an undeclared neighboring dependency or temporarily mutate `process.env`. A child registers only upstream goal-context filtering. Test the actual Pi loader and dist child-context identity; environment-marker tests alone are insufficient.

## Subagents/workflow 联动的副作用与边界

### 子会话的目标所有权

本包读取 `pi-subagents-lean` 的 v1 只读接口：父会话运行 goal，子会话只过滤继承的 goal 控制消息，不安装 goal 工具、命令或调度器。因此，子角色即使原本允许 goal，也不能用这个组合独立创建或续跑目标。角色模型、工具权限和 Task Router 规则不变，也不会自动启用 Router。

检测到 subagents manager 却没有兼容 v1 服务时，goal 门面会报兼容性错误；旧版门面、只安装原版 subagents 或其它引擎不在该自动隔离保证内。接口不是跨进程／worker 的通用检测协议，详细契约见 subagents 包的 `MAINTENANCE.md`。

### 后台等待门禁

- 仅接管 goal 为 active 时，经 `subagent(run/workflow)` 或原生 `Agent`／`SubagentWorkflow` 工具启动的委派。等待按整个父会话保守生效：任何已追踪任务未交回结果，都会挡住 goal 自动续跑和 `update_goal(status=complete)`；即使下一步与它无依赖，或已切换／新建另一个 goal，也不会自动放行。这会降低后台期间的自动推进能力。
- 真正投递到父会话的完成通知，或通过结果工具成功读取完整的终态 Agent 结果，才解除对应等待；“后台任务已经结束”本身不够。workflow 阶段之间暂时没有活动子 Agent，也仍视为未交回。失败／停止的终态结果同样可以解除该轮等待，但不代表 goal 验收通过。通知有延迟时会多等一段；完成验收会在工具实际执行时再次检查，避免仅靠预检放过同批启动的任务。
- 结果读取与 Agent `resume` 不允许并发，会返回冲突错误；请先读取结果，再在下一批工具调用中 resume。这个限制保守覆盖不同 Agent 的组合，因为句柄与 ID 可能指向同一 Agent，不能仅靠输入字符串判断。普通读取之间、全新任务启动之间不受这项限制。
- resume 会复用 Agent ID，因此其通知还必须匹配本轮启动的 `<tool-use-id>`；仍为 `queued`／`running` 的通知不会解除等待。缺少或不匹配轮次标记时会继续等待，可在 resume 启动返回后通过结果工具读取终态 Agent 结果，不会用旧通知推断新轮已结束。
- 后台任务卡住／暂停、通知丢失，或结果被外部 RPC 等未追踪入口消费并取消通知，都可能让等待一直保留。本门禁不新增超时、自行轮询或恢复调度器；Agent 的结果工具也不能读取 workflow ID 来补偿丢失的 workflow 通知。人工检查任务及 writer 状态；不要把 `/goal-resume` 或切换目标当成清除等待的方法。
- CLI 启动的 workflow、mention、外部 RPC、其它扩展派发，以及 goal 未 active 时就已启动的工作不受本层追踪。等待记录仅存于当前父会话内存，重载、重启或会话恢复后不重建旧记录；不能据此判断旧委派是否已经停止。
- 门禁不停止正在运行的任务，也不禁止用户正常输入或父 Agent 在当前轮次继续用工具。部分完成通知仍可能唤起父 Agent 处理结果，剩余任务继续阻挡自动续跑和最终完成；通知不会替用户恢复已暂停的 goal。
- 本适配保留 subagents 原生通知，没有把通知改写为 `pi-goal:wake`。原生通知自行触发的父模型回合不受 goal 的 `maxAutonomousRuns` 额度限制；该额度不是全部模型调用的上限。上游严格模式的 [wait/wake 协议](https://github.com/tmonk/pi-goal-x/blob/main/docs/advanced-usage.md#background-producer-integration)仍保留，但不是本门禁的默认接入方式。
- 门禁先于上游 `schedule` 运行，等待期间也会暂缓其中的 strict wait 截止检查；不能把 goal 的 wait deadline 当作准时超时或停止后台 writer 的保证。
- 维护依赖包括上游私有 `_goalCore.scheduler.schedule/claim` 及 subagents 的任务 ID、结果文本头和通知 XML 轮次标记格式。调度方法缺失时拒绝加载 goal 门面；格式变化可能漏记任务或无法解除等待，不能保证都自动报错。因此固定依赖并在升级时回归验证。这不是无需维护的原生联动。

## Additional behavior boundaries

- Goal tasks are persistent milestones; `todo` remains an independent current-turn list, with no bidirectional synchronization. Do not claim complete delegated token accounting or silently enable `strictExecutionContract`.
- Upstream auditing excludes project extensions by default. Enabling `auditorProjectResources` broadens resource discovery; a read-only audit policy is not an OS sandbox.

## Upstream snapshot limitation

Both the original and facade entrypoints were verified to retain the old objective after an external in-place edit and `/goal-refresh` on pi-goal-x 0.34.1; shutdown can overwrite the edit. Keep the upstream-parity regression, do not fork the storage engine to hide it, and revise the limitation when upstream fixes it. Prefer `/goal-tweak`.

## Verification

Run package type/functional tests, mixed-host discovery, fresh tool contracts and independent production installation. Integration cases cover child ownership, profile preservation, task evidence/batches, audit rejection/acceptance and notification-versus-continuation ordering without real model calls. All test homes, settings and goal pools are isolated. Tests do not justify an assertion that every upstream model/UI path was exercised.
