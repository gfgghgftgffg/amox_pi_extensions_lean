# pi-goal-x-lean

[简体中文](README.zh-CN.md)

A lean facade over [pi-goal-x](https://github.com/tmonk/pi-goal-x). It keeps the upstream engine as an exact dependency, trims the model-facing goal tool surface, and coordinates persistent goals with [@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) through `pi-subagents-lean`.

## Overview

Goal runs a persistent task loop: the model creates a goal, plans tasks, works through them, records evidence and completes an audited result. This package does not reimplement that loop. It wraps the upstream runtime, forwards its commands, UI, settings, storage and scheduler, and changes only what the model sees plus a small delegation guard.

The wrapper has three responsibilities:

- On Pi 1.7 and later, declare `get_goal` directly and expose the other six operations through one `goal` dispatcher.
- Shorten tool descriptions and remove schema annotation text without dropping parameter constraints or upstream behavior.
- Keep goals in the parent session and hold automatic continuation or completion while tracked Agent and workflow results are pending.

## Features

- **All seven operations preserved**: `create_goal`, `get_goal`, `update_goal`, `set_goal_tasks`, `update_goal_task`, `goal_questionnaire` and `propose_goal_draft` keep their upstream names, validation, events, confirmations, auditing, renderers and result envelopes.
- **On-demand tool surface on Pi 1.7+**: the model sees only `get_goal` and `goal`. The six routed operations remain active and callable, but are hidden from the tool declarations sent to the provider.
- **Direct tools on older Pi hosts**: Pi 1.4 through 1.6 skip the router and keep the seven shortened direct tools.
- **Per-operation help**: `goal` with `op: "help"` returns the operation index; adding a topic expands its description, guidelines, JSON schema and an example.
- **Task-aware behavior**: when task tracking is disabled, `set_goal_tasks` and `update_goal_task` are not routed or advertised, and draft guidance says to omit tasks.
- **Stage guidance**: the system prompt gains only the draft, lifecycle or task hint needed for the current phase. Paused goals are not prompted to plan or update tasks.
- **Subagents coordination**: child sessions only filter inherited goal context, while the parent session owns the goal and waits for background delegation results.
- **Pass-through by default**: unknown upstream tools and unmodified `ExtensionAPI` calls keep their original objects and behavior.

## Tool surface

### Pi 1.7 and later

Two goal tools are declared to the model:

| Tool | Role |
| --- | --- |
| `get_goal` | Direct, read-only access to goal state, tasks and history pages. It stays declared so a stopped turn can still read the goal. |
| `goal` | Model-only, sequential dispatcher for all seven operations. `prepareLoadout` hides the other six declarations without changing the active tool set. |

Call the dispatcher with an operation name and a JSON-encoded input string:

```text
goal({ op: "help", input: "update_goal_task" })
goal({ op: "update_goal", input: "{\"status\":\"paused\",\"reason\":\"Waiting for a decision\"}" })
```

`get_goal` can be called directly or through the dispatcher. Routed writes execute the original tool through Pi's `ctx.executeTool()`, preserving content, `details`, `terminate` and error status. Pi aggregates nested usage onto the dispatcher call; the wrapper does not copy it again.

Errors are returned to the model as errors, not as successful wrapper text. Unknown operations, operations unavailable in the current profile, invalid JSON and non-object input all fail explicitly. The terminal shows a routed call as one `goal` record; direct `get_goal` calls keep their original presentation.

### Pi 1.4 through 1.6

The router and stage guidance are not installed. The seven upstream tools are registered directly with shortened descriptions and schemas, matching the older host's tool-declaration model.

### Disabled task tracking

The active goal profile is fixed apart from the task setting. When tasks are disabled, upstream does not activate `set_goal_tasks` or `update_goal_task`; the router rejects both operations and help stops listing them. Draft guidance instructs the model to omit tasks. Upstream may still derive tasks from a numbered draft objective, which is existing engine behavior.

## Installation

Requires Pi `>=1.4.0 <2.0.0` and Node `>=22.19.0`. Install without a version pin:

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi update --extensions
```

Goal works on its own. For subagents coordination, also install:

```bash
pi install npm:@gfgghgftgffg/pi-subagents-lean
```

Keep one source per extension. Do not load upstream `pi-goal-x` separately; this package already depends on the exact upstream runtime.

From a Git checkout, use `node scripts/install-extension.mjs pi-goal-x-lean`.

## Usage

Start a guided goal with an objective and acceptance criteria:

```text
/goal Add CSV export to reports, with tests and usage documentation.
```

Review and confirm the plan to begin execution. The model can then ask drafting questions, propose a draft, set a task tree, record progress and complete the goal with evidence.

### Commands

| Command | Purpose |
| --- | --- |
| `/goal [objective]` | Start a guided goal draft with confirmation. |
| `/goal-direct <objective>` | Create a goal immediately. |
| `/sisyphus [objective]` | Draft an ordered, persistent goal with per-step done criteria. |
| `/sisyphus-direct <objective>` | Create an ordered goal immediately. |
| `/goal-tweak <change>` | Revise the objective or token budget with confirmation. |
| `/goal-pause` | Pause the goal and stop the current turn. |
| `/goal-resume [text]` | Continue now, renew the autonomous-run allowance and optionally send text to the agent. |
| `/goal-clear` | Archive the current goal after confirmation. |
| `/goal-list` | List open goals in the project. |
| `/goal-status [verbose\|health]` | Show the read-only dashboard, with optional detail or storage/runtime checks. |
| `/goal-focus` / `/goal-unfocus` | Choose the goal for this session or detach from it. |
| `/goal-refresh` | Re-read goal files, settings and ledger caches. |
| `/goal-recovery [repair]` | Inspect malformed data, stale locks and orphaned snapshots; repair requires confirmation and keeps a backup. |
| `/goal-settings [controls]` | Open goal settings, or the command/key/pause-order controls. |
| `/goal-cancel` | Cancel the current draft without creating a goal. |

See the [upstream guide](https://github.com/tmonk/pi-goal-x#readme) for the full command and setting reference.

### Drafting and revisions

`goal_questionnaire` asks a batch of drafting questions and `propose_goal_draft` opens confirmation. The mode comes from the user-started draft; the draft tool does not choose `sisyphus` on its own. A task-list confirmation ends the turn and resumes after the user confirms.

Use `/goal-tweak` to revise an objective with the agent. After editing a goal file outside Pi, run `/goal-refresh` to force a rescan and reconcile the focused goal; ordinary reads may still use a cached snapshot.

### Provider failures

If a provider error is not retryable, or the configured network-retry limit is exhausted, the goal pauses. Fix the provider problem and use `/goal-resume [text]`. The optional text is forwarded to the agent before the goal resumes.

### Goal tasks and todo

Goal tasks are persistent milestones inside the goal record. The separate `todo` extension tracks the current turn and is not synchronized with goal tasks in either direction.

## Subagents integration

The combination has two separate guarantees.

### Goal ownership stays in the parent

`pi-subagents-lean` publishes a read-only `context.v1` service backed by the real subagents runner's `AsyncLocalStorage`. This package uses it to detect a child session. A child registers only the upstream goal-context filter: it does not install goal tools, commands, the router, stage guidance or a scheduler. The parent session keeps goal ownership. Role models, tool permissions and Task Router rules are unchanged, and the router is not enabled automatically.

If a subagents manager is loaded without a compatible `context.v1` service, the goal facade raises a compatibility error instead of guessing from environment markers. Upgrade `pi-subagents-lean` rather than loading only the upstream subagents extension.

### Background work holds the goal

While a goal is active, tracked launches through `subagent` (`run` or `workflow`), the native `Agent` tool and `SubagentWorkflow` create a hold. The hold blocks automatic goal continuation and `update_goal(status=complete)` until the parent receives a completion notification or successfully reads the full terminal result.

- Holds cover the whole parent session. Pending work blocks unrelated next steps and other goals too, and switching or creating a goal does not clear a hold.
- A workflow stays pending between stages even when no child Agent is running. A delayed notification extends the wait. Merely finishing background execution does not release a hold.
- Failed or stopped terminal results release that run's hold, but do not make the goal audit successful.
- Concurrent result reads and Agent `resume` calls are rejected. Read the result first, then resume in a separate tool batch. This covers handle and ID aliases that may resolve to the same Agent.
- Resume reuses the Agent ID, so a notification must also match the current launch's tool-use marker. Notifications still marked `queued` or `running` do not release a hold, and an old notification never proves that a new run finished.
- Untracked entry points include CLI-launched workflows, mentions, external RPC, other extensions' dispatch paths and work started before the goal became active. Holds live only in the current parent session's memory and are not rebuilt after reload or restoration.

Native subagent notifications are retained rather than rewritten as `pi-goal:wake`. Parent turns woken by those notifications are outside the goal's `maxAutonomousRuns` allowance. Upstream strict mode's wait/wake protocol remains available but is not this guard's default path.

On Pi 1.7, enabling Goal adds 196 tokens to the ordinary first request body, measured with the `gpt-4o` tokenizer against an installed baseline of 1248. Draft and execution prompts add a small stage-specific hint. Per-help and read/task/draft totals are recorded in the [measurement note](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/goal-tools-design.zh-CN.md).

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-goal-x-lean | 1297 |
| pi-goal-x | 1691 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Limits and failure modes

- The delegation guard depends on upstream's private `_goalCore.scheduler.schedule/claim` seam and subagents task IDs, result headers and notification markers. If the scheduler seam is missing, the facade refuses to load rather than running without the completion guard.
- The guard adds no timeout, polling, wake-up or recovery scheduler. Stalled or paused tasks, lost notifications or result consumption through an untracked path can leave a hold pending indefinitely. `/goal-resume` and changing goals do not clear holds.
- The Agent result tool cannot read workflow IDs, so a lost workflow notification cannot be compensated for through result reads.
- Holds are conservative: any tracked pending work blocks completion and automatic continuation for the whole parent session, reducing autonomous progress while it waits.
- The guard does not stop running tasks, block normal user input or prevent the parent from using tools in the current turn. Partial notifications can wake the parent to handle results while remaining holds still block final completion.
- Goal auditing excludes project extensions by default. Enabling `auditorProjectResources` broadens resource discovery; the read-only audit policy is not an OS sandbox.

## Files

| File | Role |
| --- | --- |
| `index.ts` | Facade over the upstream extension: tool metadata, proxy forwarding, child-session branch and delegation guard wiring. |
| `router.ts` | Pi 1.7 `goal` dispatcher, loadout hiding, help topics and stage guidance. |
| `delegation.ts` | Background Agent/workflow holds, result/resume conflict checks and the completion gate. |
| `integration.ts` | Read-only bridge to the `pi-subagents-lean` `context.v1` child-context service. |

## Development

Run the package checks from this directory:

```bash
npm test
npm run typecheck
npm run check
```

Pi 1.7 host scenarios are explicit. Point the test at the installed host entry:

```bash
PI_GOAL_TEST_HOST_17=/path/to/pi-1.7/dist/index.js npm test
```

The provider measurement uses the repository script:

```bash
/home/ubuntu/miniforge3/envs/codex/bin/python scripts/measure-goal-provider.py
```

## Further reading

- [pi-goal-x upstream](https://github.com/tmonk/pi-goal-x)
- [@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents)
- [Goal tool design and measurements](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/goal-tools-design.zh-CN.md)

## Maintenance

See [MAINTENANCE.md](MAINTENANCE.md) for integration scope, concurrency limits, side effects and upgrade checks.
