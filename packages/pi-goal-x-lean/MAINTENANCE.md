# Maintenance boundary

Keep this file in English.

The original facade depends on exact `pi-goal-x@0.35.2`; it does not copy the engine. The published package has no npm publication `gitHead`, so maintenance reviews exact npm tarballs with SHA-512 integrity, not an inferred Git commit. There is no external lean-author repository. Pi development verification uses 1.4.0; supported hosts must satisfy upstream peers (`>=1.4.0 <2.0.0`).

## Retained behavior

Keep all seven upstream tool names, schemas except description annotations, prompt guidelines, lifecycle hooks, commands, shortcuts, renderers and the fixed task-setting-dependent tool profile. Draft-state gating belongs to execution, not changing tool visibility. Do not suppress `setActiveTools`, collapse names or truncate goal context: stopped-turn gates, progress classification, drafting, live-tail retention and provider-cache placement depend on them. Unknown new tools pass through unchanged until reviewed.

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

## Upstream snapshot behavior

Ordinary reads can use a cached pool snapshot. In 0.34.1 and 0.34.2 even `/goal-refresh` retained the old objective after an in-place edit; shutdown could overwrite the edit (observed on 0.34.1). The explicit command now forces a rescan in 0.35.2 (see below); this does not add file watching or change ordinary cached reads. Keep the upstream-parity regression.

## Review: 0.35.1 → 0.35.2

- Compared the exact SHA-512-recorded npm publication pair in `sources.json`, not remote HEAD `2b8f6d50ee7d647a161c2644a160fc4dc88d1517`. No bundled changelog. The published entry, Pi/typebox peers and Node floor are unchanged.
- `goal-core-tools.ts`, `goal-drafting-tools.ts` and `goal-events.ts` make their internal core types module-local; none is imported by the facade. `goal.ts` still registers the same tool groups and exposes `_goalCore`; `goal-tool-names.ts` keeps the seven registrations and the task-setting-dependent profile. Core tool fields, call defaults and result envelope are unchanged: `get_goal` returns model-facing text and separate `details.goal` / successful `details.page`, not terminal-rendered text or a body.
- `goal-context.ts` and `goal-session-safety.ts` retain the delegated filter-only contract. Scheduler `schedule` / `claim` remain available at the existing interception points. `goal-commands.ts` defers loading the status, recovery, settings and controls modules until their commands run.
- `/goal-refresh` now uses `storage/goal-files.ts::refreshActiveGoalPool` to clear the listing and file-parse caches, bypass the persisted snapshot, rebuild it and reconcile the focused goal. Its report compares pool revisions and effective settings; an objective edit need not increment the revision. The ordinary snapshot path still uses directory metadata. In the real host parity check both original and lean returned the edited goal in `details.goal.objective` and tool text, retaining paused status.
- The lifecycle regression compares the complete persisted task list across session reopen. File parsing can include optional properties set to `undefined`, which the JSON snapshot omits.

## Review: 0.34.2 → 0.35.1

- Exact SHA-512 npm snapshots in `sources.json`; no bundled changelog. The upstream manifests retain the Pi/typebox peers and Node floor. The facade still imports `goal.ts`, `goal-context.ts` and `goal-session-safety.ts`; `goal.ts` still exposes `_goalCore`, with `state.goal` now a `GoalSessionState` getter. `GoalRuntime` resolves `scheduler.claim` at delivery, and both `schedule` and `claim` still gate dispatch after the scheduler-rules extraction. Delegated sessions still register only the context filter. No wrapper code or sibling package needs to change.
- Core, task and drafting registrations retain their schemas, call defaults, argument preparation and the fixed task-setting-dependent profile. `get_goal` still separates model-facing `content[].text`, `details.goal` and the successful page's `details.page` (`content`, `nextCursor`, `totalChars`); the terminal renderer is separate. `update_goal` still dispatches to the same action classes, with blocked and paused flows extracted to `goal-update-flows.ts` and completion still audited.
- Upstream splits the core, settings, ledger, storage, and UI internals; do not restore `goal-settings.ts` or `widgets/dialog-scaffold.ts`. Layer precedence is still environment > project > global > defaults. `locale` and `PI_GOAL_LOCALE` affect UI lookup only; `i18n/locales.ts` ships no translation catalogs. Task confirmation now truncates the key-hint footer to fit, through the shared choice dialog; audit interruption still defaults to continuing work. The extracted snapshot still uses directory mtime and `/goal-refresh` still invalidates and rereads in the same order. Retain the parity regression.
- Only this publication is staged. Unpublished web and todo Git heads are excluded. Sync remains unchanged with no fork delta to port. No unrelated regression tests added; existing tests cover the facade and joint subagents ABI.

## Review: 0.34.1 → 0.34.2

- Exact npm publication snapshots with SHA-512 in `sources.json`; neither a Git HEAD substitute nor a published changelog was used. The manifests retain the same Pi/typebox peers and Node requirement. The new `extensions/goal.ts` inlines the removed `goal-tools.ts` installer in the same registration order; formatting and terminal input move to dedicated modules. The facade still imports `goal.ts`, `goal-context.ts` and `goal-session-safety.ts`, receives `_goalCore`, and interposes on the same scheduler `schedule`/`claim` methods. No removed shim is restored.
- `goal-events.ts` now pauses at `agent_settled` for non-transient provider errors and after a configured retry limit is exhausted. `goal-scheduler.ts` saves the pause and clears continuation state; transient retries remain separate. `session_compact_failed` flushes buffered goal changes and warns without pausing; the next request after successful compaction still gets the goal resync delta. `/goal-resume [text]` forwards text as a follow-up when idle or steer when busy, before attempting to resume the goal. `runGoalRefresh` still has the same cache/refresh sequence; do not infer a storage fix from the version bump.
- `get_goal` keeps separate model text (`content[].text`), goal state (`details.goal`) and successful page payload (`details.page`); renderer output is not the tool response.
- Owner approved the upstream contract migration. `extensions/goal-tool-names.ts` and `extensions/goal-drafting.ts` remove `goal_question`, leaving `goal_questionnaire`, and replace the phase-dependent tool profile with a fixed, task-setting-dependent list. Draft gating moves into `goal-events.ts` and tool execution. `propose_goal_draft` removes `sisyphus` from its schema, strips the legacy argument in `prepareArguments`, and uses the mode of the user-started draft. The lean metadata drops the deleted tool and parameter instruction without suppressing the remaining upstream behavior.
- Migrated only version-specific tests: seven registrations and fixed profiles replace the old eight-tool phase expectations. Lifecycle, execution, audit, task evidence, upstream-parity, child-session and joint ABI assertions remain. The first check failed four stale profile assertions even against upstream 0.34.2; subsequent verification must run all gates before publication.

## Verification

Run package type/functional tests, mixed-host discovery, fresh tool contracts and independent production installation. Integration cases cover child ownership, profile preservation, task evidence/batches, audit rejection/acceptance and notification-versus-continuation ordering without real model calls. All test homes, settings and goal pools are isolated. Tests do not justify an assertion that every upstream model/UI path was exercised.
