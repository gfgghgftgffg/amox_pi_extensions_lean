# Maintenance Boundary — pi-goal-x-lean

Keep this file in English.

## Upstream Baseline and Packaging

- **Original repository facade** — `@gfgghgftgffg/pi-goal-x-lean` depends on exact `pi-goal-x@0.35.2`; it does not copy the engine. There is no external lean-author repository for this package.
- **SHA-512 npm source verification** — Because published `pi-goal-x` releases carry no npm `gitHead` field, daily maintenance compares exact npm tarballs with SHA-512 integrity rather than inferring a Git commit or tag.
- **Host & file contracts** — Local development verification targets Pi `1.7.0`, and supported hosts must satisfy upstream peer bounds (`>=1.7.0 <2.0.0`). Helper modules (`index.ts`, `router.ts`, `integration.ts`, `delegation.ts` — notably `router.ts`) are declared published sources and must remain synchronized across `maintenance/manifest.json` (`sourceFiles`), `package.json` (`files`), and the npm archive validator.

## Retained Runtime and Router Contract

- **Preserved upstream surface** — Retain all seven upstream tool names (`create_goal`, `get_goal`, `update_goal`, `set_goal_tasks`, `update_goal_task`, `goal_questionnaire`, `propose_goal_draft`), structural schemas (stripping only verbose description annotations), prompt guidelines, lifecycle hooks, slash commands, shortcuts, TUI renderers, and the fixed task-setting-dependent active tool profile. Draft-mode restrictions belong in execution guards rather than dynamic visibility toggles. Never suppress `setActiveTools`, rename underlying tools, or truncate goal context messages — stopped-turn gates, progress classification, drafting flows, live-tail retention, and provider prompt-cache placement rely on them. Unrecognized future upstream tools pass through untouched until reviewed.
- **Pi 1.7+ two-tool loadout** — `prepareLoadout` exposes only `get_goal` and the `goal` dispatcher to the model while keeping the other six upstream tools active in the host registry. `goal` routes all seven operations via `ctx.executeTool()`, preserving `content`, `details`, `terminate`, and error flags without duplicating nested token usage onto the wrapper. Keeping `get_goal` directly declared allows read-only inspection on stopped turns. Both the router and stage-specific prompt guidance are always installed (no legacy direct-tool branch): stage hints emit only the draft, active-lifecycle, or paused guidance relevant to the current state, and omit task hints whenever `disableTasks` deactivates task tools.

## Integration Contracts

The facade queries the optional global service `globalThis[Symbol.for('@gfgghgftgffg/pi-subagents-lean.context.v1')]` backed by the published `pi-subagents` `dist` runner's `AsyncLocalStorage` child flag. Never duplicate child-context storage, import undeclared sibling workspace paths, or mutate `process.env`. Child sessions install only upstream goal-context filtering — never the `goal` router, write tools, commands, or scheduler. Always validate child isolation against the real Pi loader and `dist` module graph on Pi 1.7 rather than relying solely on environment-variable stubs.

## Subagents and workflow integration boundaries

### Child-session goal ownership

When paired with `pi-subagents-lean`, the parent session owns the Goal lifecycle exclusively while child sessions register only the inherited goal-control message filter (no goal tools, slash commands, or autonomous scheduler). Even if a subagent role definition permits goal tools, it cannot start or advance an independent goal under this pairing — without requiring per-role `exclude_extensions` rules. Agent models, tool permissions, and Task Router policies remain untouched (Task Router is never enabled automatically).

If a `pi-subagents` manager is detected without a compatible v1 context service, `pi-goal-x-lean` raises an explicit compatibility error rather than silently losing child isolation. Upstream-only `pi-subagents` installations, older wrappers, and external multi-process/worker runtimes fall outside this in-process contract; see `packages/pi-subagents-lean/MAINTENANCE.md` for the provider-side specification.

### Background waiting guard

- **Tracked launch scope** — Monitors delegations started while a goal is active via `subagent` (`run` / `workflow`) or native `Agent` / `SubagentWorkflow` calls. Holds apply conservatively across the entire parent session: any pending tracked run blocks automatic goal continuation and `update_goal(status="complete")`, even when the next step is unrelated or after switching/creating another goal. Completion is re-verified inside tool execution so same-batch launches cannot slip past preflight checks.
- **Hold release semantics** — A hold clears only when its completion notification is delivered to the parent session or when a full terminal Agent result is read via the result tool (background process exit alone does not release the hold, and workflows remain held across inter-stage gaps even when zero child Agents are momentarily active). Failed or stopped terminal runs also release their hold without implying audit approval; delayed notifications extend the wait accordingly.
- **Result-read vs. `resume` batch exclusion** — Mixing a result read and an Agent `resume` in the same tool batch is rejected as a conflict because handles and IDs can alias the same Agent; read results in one batch and `resume` in the next (concurrent reads and fresh launches remain unrestricted).
- **Resume run-marker matching** — Because `resume` reuses an existing Agent ID, incoming notifications must match the active launch's `<tool-use-id>` and carry a terminal status (`queued` / `running` notifications or stale/missing markers never clear a new hold; once the `resume` call returns, terminal Agent output can also be fetched via the result tool).
- **No synthetic timeout or reload persistence** — Stalled tasks, dropped notifications, or external RPC reads that consume and cancel notifications can leave a hold pending indefinitely (and the Agent result tool cannot read workflow IDs to recover lost workflow notifications). The guard introduces no polling, timeout, or recovery scheduler; `/goal-resume` and goal switches do not purge active holds, and holds live strictly in parent-session memory without surviving reload, restart, or session restore. CLI workflows, `@` mentions, external RPC launches, third-party dispatchers, and tasks started before goal activation are untracked.
- **Non-intrusive turn behavior & token budgets** — Active holds never kill running tasks, block manual user prompts, or restrict parent tool calls during an active turn; partial completion notifications can wake the parent while remaining holds still block autonomous continuation and final completion (notifications never unpause a user-paused goal). Native subagent notifications are preserved rather than rewritten into `pi-goal:wake`, so notification-triggered parent turns sit outside `maxAutonomousRuns`. Upstream strict mode's [wait/wake protocol](https://github.com/tmonk/pi-goal-x/blob/main/docs/advanced-usage.md#background-producer-integration) remains available independently. The guard intercepts before upstream `schedule` and defers strict-wait deadline checks while holds remain open.
- **Private upstream coupling** — Relies on `_goalCore.scheduler.schedule` / `claim` plus subagent task IDs, result headers, and notification XML markers. Missing scheduler hooks fail closed on load, whereas upstream text/XML format shifts could silently miss holds; keep exact dependency pins and run joint regressions on every upgrade.

## Additional Behavior and Snapshot Boundaries

- **Independent `todo` state & audit scope** — Goal tasks are persistent milestones in the goal file and never sync bidirectionally with `todo`. Do not claim full delegated token rollups or silently enable `strictExecutionContract`. Upstream completion auditing excludes project extensions unless `auditorProjectResources` is opted in, and read-only audit prompts are not an OS sandbox.
- **Cached pool snapshots vs. `/goal-refresh`** — Ordinary reads consult a cached snapshot keyed by directory metadata. While `0.34.1`–`0.34.2` retained stale objectives across `/goal-refresh` after external edits, `0.35.2+` forces a disk rescan on `/goal-refresh` without adding background file watchers to ordinary reads; retain the upstream-parity regression.

## Verification

Run workspace typechecks, functional tests, host discovery, fresh contract checks, and isolated production installation (all test `HOME` directories, settings, and goal pools stay isolated offline without live model calls):

```bash
npm test --workspace @gfgghgftgffg/pi-goal-x-lean
python3 scripts/measure-goal-provider.py  # requires tiktoken==0.12.0
```

`tests/fixtures/provider-baseline.json` stores the pre-router lean baseline tokenized with `tiktoken==0.12.0` (`gpt-4o`) against canonicalized loopback request bodies.

## Upstream Review History

### 0.35.1 → 0.35.2

- Compared SHA-512-verified npm tarballs in `sources.json` (excluding unpublished remote HEAD `2b8f6d50ee7d647a161c2644a160fc4dc88d1517`; no bundled changelog). Entrypoints, Pi/TypeBox peers, and Node floor remain unchanged.
- Internal core types in `goal-core-tools.ts`, `goal-drafting-tools.ts`, and `goal-events.ts` narrowed to module-local scope without affecting facade imports (`goal.ts`, `goal-context.ts`, `goal-session-safety.ts`), `_goalCore`, the seven-tool profile, `schedule`/`claim` hooks, or `get_goal`'s separated `content[].text` and `details.goal` / `details.page` response contract (`goal-commands.ts` now lazy-loads status, recovery, settings, and controls).
- `/goal-refresh` now calls `storage/goal-files.ts::refreshActiveGoalPool` to purge listing/parse caches, rebuild the persisted snapshot, and reconcile focus; host parity tests confirm external objective edits surface in both `details.goal.objective` and tool text while preserving paused state (persisted JSON task snapshots omit `undefined` optional fields returned by live file parsing).

### 0.34.2 → 0.35.1

- Compared SHA-512-verified npm tarballs in `sources.json` (no bundled changelog). Peers, Node floor, facade imports, delegated filter-only early return, seven-tool schemas/defaults, `get_goal` payload separation, and audited `update_goal` flows (`goal-update-flows.ts`) remain compatible (`state.goal` became a `GoalSessionState` getter and `GoalRuntime` resolves `scheduler.claim` dynamically across extracted scheduler rules).
- Upstream modularized settings, ledger, storage, and shared choice-dialog UI (truncating task-confirmation key hints to fit width and defaulting audit interrupts to continue work; `locale` / `PI_GOAL_LOCALE` ships with an empty catalog registry). Removed internal files (`goal-settings.ts`, `widgets/dialog-scaffold.ts`) are not restored.

### 0.34.1 → 0.34.2

- Compared SHA-512-verified npm tarballs in `sources.json`. `extensions/goal.ts` inlined the former `goal-tools.ts` registrar in identical order while keeping `goal-context.ts`, `goal-session-safety.ts`, `_goalCore`, and `schedule`/`claim` interception intact.
- Non-transient provider errors and exhausted retry budgets now persist a pause at `agent_settled`; `session_compact_failed` flushes buffered goal updates with a warning rather than pausing; `/goal-resume [text]` forwards user text via follow-up or steer before resuming.
- Adopted upstream's owner-approved contract migration: removed `goal_question` (retaining `goal_questionnaire`), switched `goal-tool-names.ts` to a fixed task-setting-dependent seven-tool profile with execution-time draft gating in `goal-events.ts`, and dropped legacy `sisyphus` from `propose_goal_draft`'s schema (stripped in `prepareArguments` in favor of stored draft mode). Updated version-specific profile assertions from eight tools to seven while preserving all lifecycle, audit, parity, and joint subagents ABI gates.
