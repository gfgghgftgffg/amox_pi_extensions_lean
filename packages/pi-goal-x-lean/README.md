# @gfgghgftgffg/pi-goal-x-lean

[简体中文](README.zh-CN.md)

## Advantage

A lighter wrapper for [`pi-goal-x`](https://github.com/tmonk/pi-goal-x). Goal creation, tasks, questionnaires, auditing and all commands are retained; on Pi 1.7 the first request carries only `get_goal` and `goal`, about 188 character-proxy units of model-visible tool text versus 1691 upstream — roughly 89% less.

## Features

- The seven operations `create_goal`, `get_goal`, `update_goal`, `set_goal_tasks`, `update_goal_task`, `goal_questionnaire` and `propose_goal_draft` still run upstream. Validation, confirmations, auditing, commands, UI, settings and goal-file formats are unchanged.
- `get_goal` reads state directly. The other operations go through `goal`: pass the operation in `op` and a JSON object string in `input`. `goal` with `help` expands one operation's parameters and example. The six routed operations stay active but are not sent to the model.
- With task tracking off, `set_goal_tasks` and `update_goal_task` are not routed or shown, and draft guidance omits tasks.
- Draft, active and paused stages add only the hints they need; paused goals are not prompted to plan tasks.
- Minor adjustments to `pi-goal-x-lean` and `pi-subagents-lean` keep them compatible: child sessions only filter inherited goal context and install no goal tools, commands or scheduler. While a goal is active, tracked background Agent/workflow results hold automatic continuation and completion until they are returned.
- With `rpiv-todo-lean` 0.1.17 or newer installed, an active Goal hides the Todo panel in the terminal session that owns it. `/goal-pause` lets Todo reappear when Autoresearch is off. Other sessions can still see their Todo panel.

## Source

This package is the repository's original facade over [`pi-goal-x`](https://github.com/tmonk/pi-goal-x); it does not copy the engine. The upstream engine is tmonk/pi-goal-x, and both are MIT. It lives in [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md).

## Usage

### Start a goal

```text
/goal Add CSV export to reports, with tests and usage documentation.
```

Confirm the plan to start. `/goal-direct` creates immediately, `/sisyphus` drafts an ordered goal, and `/sisyphus-direct` creates one directly. `/goal-tweak` revises the objective or budget; `/goal-pause` and `/goal-resume` pause or continue.

### Tool calls

Read state:

```json
{ "op": "get_goal", "input": "{\"section\":\"tasks\"}" }
```

`get_goal` may also be called directly. Update a goal:

```json
{ "op": "update_goal", "input": "{\"status\":\"paused\",\"reason\":\"Waiting for a decision\"}" }
```

See every parameter for one operation:

```json
{ "op": "help", "input": "update_goal_task" }
```

`op` is the operation name and `input` is a JSON object string. Unknown operations, invalid JSON and non-object input are returned as errors.

### Common commands

| Command | Purpose |
| --- | --- |
| `/goal [objective]` | Draft a goal; start after confirmation |
| `/goal-direct <objective>` | Create a goal immediately |
| `/sisyphus [objective]` | Draft an ordered goal with per-step done criteria |
| `/goal-tweak <change>` | Revise the objective or token budget |
| `/goal-pause` / `/goal-resume [text]` | Pause or continue |
| `/goal-status [verbose\|health]` | Read-only dashboard with storage and runtime checks |
| `/goal-refresh` | Re-read goal files, settings and ledger |
| `/goal-settings` | Goal settings and controls |

The remaining commands (`/goal-list`, `/goal-focus`, `/goal-unfocus`, `/goal-clear`, `/goal-cancel`, `/goal-recovery`) are covered in the [upstream guide](https://github.com/tmonk/pi-goal-x#readme).

## Installation

Requires Pi 1.7.0 or newer. This is a public npm package; install without a version pin:

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi update --extensions
```

For subagents integration, also install or update [`pi-subagents-lean`](../pi-subagents-lean/README.md):

```bash
pi install npm:@gfgghgftgffg/pi-subagents-lean
```

For a Git fallback, run from the repository checkout:

```bash
node scripts/install-extension.mjs pi-goal-x-lean
```

Update a local Git installation by pulling the checkout and rerunning its installer; `pi update` does not update local contents. Keep one installation source. To migrate, back up settings, remove only the exact old source shown by `pi list`, then install the npm source. Do not load upstream `pi-goal-x` or another goal wrapper alongside it.

## Configuration and limits

- After editing a goal file outside Pi, use `/goal-refresh` to rescan; ordinary reads may still use a cached snapshot.
- A non-retryable provider error, or an exhausted network-retry limit, pauses the goal. Fix the problem and use `/goal-resume [text]`.
- Goal tasks are persistent milestones in the goal record; the separate `todo` list is not synchronized with them.
- The subagents link tracks only work launched under an active goal through `subagent`, `Agent` and `SubagentWorkflow`. Do not combine a result read and an Agent `resume` in one batch. Holds cover the whole parent session, have no timeout or recovery scheduler, and are not restored after reload. CLI workflows, mentions, external RPC and work started before the goal became active are not tracked.

## Model-visible tool text (character proxy)

<!-- amox-measurement:start -->
| Package | Model-visible tools (character proxy) |
| --- | ---: |
| @gfgghgftgffg/pi-goal-x-lean | 188 |
| pi-goal-x | 1691 |

Counts only tool declarations sent to the model. Fixed ceil(characters / 4); not provider billing tokens.
<!-- amox-measurement:end -->

## Development

See the [development and maintenance guide](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md) and [MAINTENANCE.md](MAINTENANCE.md) for adaptation details.
