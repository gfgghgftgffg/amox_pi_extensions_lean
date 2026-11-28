# @gfgghgftgffg/pi-goal-x-lean

[![npm](https://img.shields.io/npm/v/@gfgghgftgffg/pi-goal-x-lean?style=flat-square)](https://www.npmjs.com/package/@gfgghgftgffg/pi-goal-x-lean)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.7.0%20%3C2.0.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**An on-demand, low-context facade for [`pi-goal-x`](https://github.com/tmonk/pi-goal-x) — sending ~89% less model-visible tool text on the first turn (188 vs. 1,691 character-proxy units).**

[简体中文](README.zh-CN.md)

Preserves persistent goals, milestones, interactive questionnaires, completion auditing, and every `/goal*` command from `pi-goal-x`, while exposing only `get_goal` and a compact `goal` dispatcher to the model on Pi 1.7+.

## Features

- **Two-tool model surface** — `get_goal` reads goal state directly; all seven upstream operations (`create_goal`, `get_goal`, `update_goal`, `set_goal_tasks`, `update_goal_task`, `goal_questionnaire`, `propose_goal_draft`) remain active and callable through `goal` (`op` + JSON `input`), with per-operation schemas and examples available on demand via `op: "help"`.
- **Stage-aware guidance** — Appends concise instructions tailored to draft, active, or paused states (paused goals only advertise read and lifecycle operations), and automatically omits `set_goal_tasks` and `update_goal_task` from routing, help, and draft hints when task tracking is disabled.
- **Full upstream engine fidelity** — Parameter validation, user confirmations, completion auditing, TUI dialogs, settings, and goal file formats run directly on upstream `pi-goal-x`.
- **Subagents coordination** — Paired with [`pi-subagents-lean`](../pi-subagents-lean/README.md), child sessions filter inherited goal-control messages without installing goal tools, commands, or schedulers, while background `Agent` and `SubagentWorkflow` runs hold automatic continuation and completion until their results reach the parent.
- **Todo panel coordination** — Paired with [`rpiv-todo-lean`](../rpiv-todo-lean/README.md) `0.1.17+`, an active Goal automatically hides the Todo panel in the owning terminal session (`/goal-pause` restores Todo once Autoresearch is off; other sessions keep their Todo panels visible).

## Installation

Requires Pi `>=1.7.0 <2.0.0`. Install from npm without pinning a version:

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi update --extensions
```

For subagent isolation and background-work holds, install or update [`pi-subagents-lean`](../pi-subagents-lean/README.md) as well:

```bash
pi install npm:@gfgghgftgffg/pi-subagents-lean
```

Or install from a local checkout of the monorepo:

```bash
node scripts/install-extension.mjs pi-goal-x-lean
```

> [!IMPORTANT]
> Do not load upstream `pi-goal-x` or another goal wrapper alongside this package. Local Git installations are updated by pulling the checkout and re-running `install-extension.mjs` (`pi update` does not update local checkouts). When migrating to npm, back up settings, remove the exact old entry shown in `pi list`, and install the npm package.

## Usage

### Slash Commands

Draft a goal interactively and confirm the plan to start:

```text
/goal Add CSV export to reports, with tests and usage documentation.
```

| Command | Purpose |
| --- | --- |
| `/goal [objective]` | Draft a goal interactively and start after confirmation |
| `/goal-direct <objective>` | Create and start a goal immediately |
| `/sisyphus [objective]` | Draft an ordered goal with explicit per-step done criteria (`/sisyphus-direct` creates immediately) |
| `/goal-tweak <change>` | Revise the active objective or token budget |
| `/goal-pause` / `/goal-resume [text]` | Pause execution or resume (optionally forwarding follow-up instructions) |
| `/goal-status [verbose\|health]` | Open the read-only status dashboard with storage and runtime checks |
| `/goal-refresh` | Force a rescan of goal files, settings, and ledger on disk |
| `/goal-settings` | Configure Goal behavior and controls |

Additional commands (`/goal-list`, `/goal-focus`, `/goal-unfocus`, `/goal-clear`, `/goal-cancel`, `/goal-recovery`) are documented in the [upstream guide](https://github.com/tmonk/pi-goal-x#readme).

### Tool Dispatch

`get_goal` can be called directly or routed through `goal`. All write and drafting operations use `goal` with `op` set to the operation name and `input` set to a JSON object string:

**Read goal tasks:**

```json
{ "op": "get_goal", "input": "{\"section\":\"tasks\"}" }
```

**Pause or update a goal:**

```json
{ "op": "update_goal", "input": "{\"status\":\"paused\",\"reason\":\"Waiting for a decision\"}" }
```

**Expand full parameters and an example for one operation:**

```json
{ "op": "help", "input": "update_goal_task" }
```

Unknown operations, malformed JSON, and non-object `input` payloads return structured tool errors.

## Operational Notes and Boundaries

- **External file edits** — Ordinary reads may serve a cached snapshot; run `/goal-refresh` after editing goal files outside Pi (or use `/goal-tweak` inside Pi).
- **Provider error handling** — Non-retryable provider errors or exhausted network retries automatically pause the goal. Resolve the issue and run `/goal-resume [text]`.
- **Goal tasks vs. `todo`** — Goal tasks are persistent milestones stored in the goal record and are not synchronized with the session-local `todo` list.
- **Subagent tracking scope** — The background waiting guard only tracks work launched while a goal is active via `subagent`, `Agent`, or `SubagentWorkflow`. Do not mix a result read and an Agent `resume` in the same tool batch. Holds apply across the parent session, carry no automatic timeout or recovery scheduler, and are not reconstructed across reloads; CLI workflows, mentions, external RPC, and work started before the goal became active are outside tracking.

## Model-visible tool text (character proxy)

<!-- amox-measurement:start -->
| Package | Model-visible tools (character proxy) |
| --- | ---: |
| @gfgghgftgffg/pi-goal-x-lean | 188 |
| pi-goal-x | 1691 |

Counts only tool declarations sent to the model. Fixed ceil(characters / 4); not provider billing tokens.
<!-- amox-measurement:end -->

## Source and Development

Original facade authored in [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md) over [tmonk/pi-goal-x](https://github.com/tmonk/pi-goal-x). The upstream runtime is installed as an exact dependency without copying engine code, and both packages are MIT-licensed.

See the [maintenance policy](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md) and [MAINTENANCE.md](MAINTENANCE.md) for router design and subagent integration contracts.
