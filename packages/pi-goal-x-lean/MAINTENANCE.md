# Maintenance boundary

Keep this file in English.

The original facade depends on exact `pi-goal-x@0.34.1`; it does not copy the engine. The published package has no npm publication `gitHead`, so maintenance reviews exact npm tarballs with SHA-512 integrity, not an inferred Git commit. There is no external lean-author repository. Pi development verification uses 1.4.0; supported hosts must satisfy upstream peers (`>=1.4.0 <2.0.0`).

## Retained behavior

Keep all eight upstream tool names, schemas except description annotations, prompt guidelines, lifecycle hooks, commands, shortcuts, renderers and tool profiles. Do not suppress `setActiveTools`, collapse names or truncate goal context: stopped-turn gates, progress classification, drafting, live-tail retention and provider-cache placement depend on them. Unknown new tools pass through unchanged until reviewed.

## Integration contracts

The optional `@gfgghgftgffg/pi-subagents-lean.context.v1` global service supplies the actual dist runner's AsyncLocalStorage child flag. Never copy child-context state, resolve an undeclared neighboring dependency or temporarily mutate `process.env`. A child registers only upstream goal-context filtering. Test the actual Pi loader and dist child-context identity; environment-marker tests alone are insufficient.

## Subagents and workflow integration boundaries

### Child-session goal ownership

This package reads the read-only v1 interface from `pi-subagents-lean`: the parent session runs goal, while child sessions only filter inherited goal-control messages and do not install goal tools, commands or a scheduler. Even a child role that normally allows goal cannot create or continue an independent goal through this combination. Role models, tool permissions and Task Router rules remain unchanged; Router is not enabled automatically.

If a subagents manager is present without a compatible v1 service, the goal facade reports a compatibility error. Older facades, upstream-only subagents installations and other engines are outside this automatic isolation contract. The interface is not a general cross-process or worker detection protocol; see the subagents package's `MAINTENANCE.md` for its contract.

### Background waiting guard

- Tracks only delegation launched while a goal is active through `subagent(run/workflow)` or the native `Agent` / `SubagentWorkflow` tools. Holds conservatively cover the entire parent session: any tracked work awaiting results blocks automatic goal continuation and `update_goal(status=complete)`, even for an unrelated next step or after switching to or creating another goal. This reduces autonomous progress while background work is pending.
- A completion notification delivered to the parent, or a successful result-tool read of the full terminal Agent result, releases the corresponding hold; merely finishing background execution does not. A workflow remains pending between stages even when no child Agent is active. Failed or stopped terminal results also release that run's hold but do not imply successful goal auditing. Delayed notifications extend the wait. Completion is checked again during tool execution so preflight alone cannot miss a launch in the same batch.
- Concurrent result reads and Agent `resume` calls are rejected as conflicts; read results first, then resume in the next tool batch. This restriction conservatively covers combinations involving different Agents because a handle and an ID may identify the same Agent. Concurrent reads and fresh launches are unaffected by this restriction.
- Resume reuses the Agent ID, so its notification must also match the current launch's `<tool-use-id>`. Notifications still marked `queued` or `running` do not release a hold. Missing or mismatched run markers leave it pending; after the resume launch returns, a terminal Agent result can be read through the result tool. An old notification never establishes that a new run has finished.
- Stalled or paused tasks, lost notifications, or result consumption through an untracked entry point such as external RPC that cancels the notification can leave a hold pending indefinitely. The guard adds no timeout, polling or recovery scheduler. The Agent result tool cannot read workflow IDs to compensate for lost workflow notifications. Inspect task and writer state manually; `/goal-resume` and switching goals do not clear holds.
- CLI-launched workflows, mentions, external RPC, other extensions' dispatch paths and work started before the goal became active are not tracked. Holds exist only in the current parent session's memory and are not reconstructed after reload, restart or session restoration. Missing holds do not establish that old delegated work has stopped.
- The guard does not stop running tasks, block normal user input or prevent the parent Agent from using tools in its current turn. Partial completion notifications can still wake the parent to handle results while remaining holds block automatic continuation and final completion. Notifications do not resume a paused goal on the user's behalf.
- This integration retains native subagents notifications rather than rewriting them as `pi-goal:wake`. Parent model turns triggered by those notifications are outside goal's `maxAutonomousRuns` allowance; that allowance is not a cap on all model calls. Upstream strict mode's [wait/wake protocol](https://github.com/tmonk/pi-goal-x/blob/main/docs/advanced-usage.md#background-producer-integration) remains available but is not this guard's default integration path.
- The guard runs before upstream `schedule` and also defers its strict-wait deadline checks while holds are pending. A goal wait deadline is not a punctual timeout or a guarantee that background writers will stop.
- Maintenance depends on upstream's private `_goalCore.scheduler.schedule/claim` methods and subagents task IDs, result-text headers and notification XML run markers. Missing scheduler methods prevent the goal facade from loading. Format changes can cause missed launches or unreleased holds without necessarily producing an automatic error. Keep dependencies pinned and rerun regressions on upgrades; this is not a maintenance-free native integration.

## Additional behavior boundaries

- Goal tasks are persistent milestones; `todo` remains an independent current-turn list, with no bidirectional synchronization. Do not claim complete delegated token accounting or silently enable `strictExecutionContract`.
- Upstream auditing excludes project extensions by default. Enabling `auditorProjectResources` broadens resource discovery; a read-only audit policy is not an OS sandbox.

## Upstream snapshot limitation

Both the original and facade entrypoints were verified to retain the old objective after an external in-place edit and `/goal-refresh` on pi-goal-x 0.34.1; shutdown can overwrite the edit. Keep the upstream-parity regression, do not fork the storage engine to hide it, and revise the limitation when upstream fixes it. Prefer `/goal-tweak`.

## Verification

Run package type/functional tests, mixed-host discovery, fresh tool contracts and independent production installation. Integration cases cover child ownership, profile preservation, task evidence/batches, audit rejection/acceptance and notification-versus-continuation ordering without real model calls. All test homes, settings and goal pools are isolated. Tests do not justify an assertion that every upstream model/UI path was exercised.
