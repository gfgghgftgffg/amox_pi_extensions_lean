# pi-goal-x-lean

[简体中文](README.zh-CN.md)

A lightweight wrapper over [pi-goal-x](https://github.com/tmonk/pi-goal-x). The upstream engine is not copied. Compatible with [@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) and its workflows via `pi-subagents-lean`.

## Features

- Keeps the seven upstream operations, commands, UI, settings and goal-file formats. On Pi 1.7+ the model sees `get_goal` directly and one `goal` dispatcher for goal and task operations; older Pi releases keep the seven direct lean tools. The active profile is fixed apart from the task setting; `goal_questionnaire` handles drafting and the user-started draft supplies the goal mode.
- When task tracking is disabled, task operations are neither routed nor advertised, and draft guidance says to omit tasks.
- Adds a small integration layer that keeps goals in the parent session and waits for tracked Agent/workflow results before automatic continuation or completion.

## Installation

Requires Pi `>=1.4.0 <2.0.0` and Node `>=22.19.0`. Install without a version pin:

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi update --extensions
```

Goal works alone. For subagents integration, also run `pi install npm:@gfgghgftgffg/pi-subagents-lean`. Keep one source per extension; do not separately load upstream `pi-goal-x`. Child sessions only filter inherited goal context; they do not install goal tools or routing.

For a Git checkout, use `node scripts/install-extension.mjs pi-goal-x-lean`.

## Usage

```text
/goal Add CSV export to reports, with tests and usage documentation.
```

Confirm the plan to start. Use `/goal-direct` for direct creation, `/sisyphus` for ordered steps, `/goal-tweak` to revise, and `/goal-pause` / `/goal-resume` to pause or resume. See the [upstream guide](https://github.com/tmonk/pi-goal-x#readme) for all commands.

On Pi 1.7+, call `get_goal` directly for state. Call `goal` with `op` set to an operation and JSON-encoded `input`; `goal({"op":"help","input":"update_goal_task"})` expands one operation. A task-list confirmation ends the turn and resumes after confirmation. Older Pi releases use the native seven tool names.

If a provider error cannot be retried, or a configured network-retry limit is exhausted, the goal pauses. Fix the provider issue, then use `/goal-resume [text]`; optional text is sent to the agent.

Use `/goal-tweak` to revise an objective with the agent. After an external edit to a goal file, run `/goal-refresh` to rescan the files and update the focused goal; ordinary reads can still use a cached snapshot.

On Pi 1.7, enabling Goal adds 196 tokens to the ordinary first request body, measured with the `gpt-4o` tokenizer (installed baseline 1248). Draft and execution prompts add guidance for the current stage. The [measurement note](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/goal-tools-design.zh-CN.md) lists the per-help and read/task/draft totals.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-goal-x-lean | 1297 |
| pi-goal-x | 1691 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Maintenance

See [MAINTENANCE.md](MAINTENANCE.md) for integration scope, concurrency limits, side effects and upgrade checks.
