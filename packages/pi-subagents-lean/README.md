# @gfgghgftgffg/pi-subagents-lean

[![npm](https://img.shields.io/npm/v/@gfgghgftgffg/pi-subagents-lean?style=flat-square)](https://www.npmjs.com/package/@gfgghgftgffg/pi-subagents-lean)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.1.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**A unified, ultra-lean facade for [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) — cutting registered tool text by ~97%.**

[简体中文](README.zh-CN.md)

Routes agent launches, result inspection, mid-flight steering, and scripted workflows through a single `subagent` tool while retaining upstream background execution, schedules, FleetView UI, and native result cards.

## Features

- **Five operations in one tool** — `run`, `result`, `steer`, `workflow`, and `help` share a single `subagent` registration backed by the upstream published runtime.
- **Validated JSON passthrough** — Uncommon fields stay out of the permanent schema; pass them as a JSON object string in `input` (validated against the real upstream TypeBox schema before execution) and inspect full schemas via `op: "help"`.
- **Workflow authoring & exposure parity** — `help` for `workflow` includes the authoring guide, or points to the bundled upstream skill path when `workflowToolExposure: "skill"` is configured. Because the facade is always a single tool, `"deferred"` exposure does not split or defer its `workflow` operation.
- **Dynamic startup agent roster** — `subagent_type` lists agent types enabled when the extension loads (reload after editing agent files, or run `op: "help"` with `input: "run"` if upstream's custom description cannot be parsed).
- **Nested FleetView & Goal bridge** — FleetView nests child agents under their parent with per-agent token usage (`❯` marks the cursor, `●` marks the open view, and `showModel` adds model and thinking level). Also registers a read-only child-session context bridge so [`pi-goal-x-lean`](../pi-goal-x-lean/README.md) keeps goal ownership in the parent session.

## Installation

Install from npm without pinning a version:

```bash
pi install npm:@gfgghgftgffg/pi-subagents-lean
pi update --extensions
```

For optional persistent-goal coordination, install or update [`pi-goal-x-lean`](../pi-goal-x-lean/README.md) alongside it:

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
```

Or install from a local checkout of the monorepo:

```bash
node scripts/install-extension.mjs pi-subagents-lean
```

> [!IMPORTANT]
> Do not load another `pi-subagents` wrapper alongside this package. Local Git installations are updated by pulling the checkout and re-running `install-extension.mjs` (`pi update` does not update local checkouts). When migrating to npm, back up settings, remove the exact old entry shown in `pi list`, and install the npm package.

## Usage

**Launch a subagent (`run_in_background: false` waits inline when the next step depends on it, unless the agent's definition forces background execution):**

```json
{
  "op": "run",
  "prompt": "Find the implementation of the cache key.",
  "description": "Locate cache key",
  "subagent_type": "Explore",
  "run_in_background": true
}
```

**Check status or read finished output (pass `agent_id` or a saved handle after reload):**

```json
{ "op": "result", "agent_id": "agent-id" }
```

`result` returns immediately by default; prefer completion notifications for background tasks, or pass `input: "{\"wait\":true}"` when the next step is blocked on a running agent. Saved records include completion timestamp and relative age when available.

**Steer a running subagent:**

```json
{ "op": "steer", "agent_id": "agent-id", "message": "Also check the tests." }
```

**Run an explicit or named saved workflow (for "use N agents", prefer parallel `run` calls instead):**

```json
{ "op": "workflow", "input": "{\"name\":\"review-panel\"}" }
```

**Inspect every parameter for an operation:**

```json
{ "op": "help", "input": "run" }
```

> [!TIP]
> Headless runs (`pi -p` and JSON mode) automatically wait for background agents and workflows before exiting so the parent session can respond to their output. Set `headlessWaitMinutes` in `subagents.json` to bound that wait (`0`, the default, means unlimited). Subagents also wait for their own background children before finishing, and child results remain readable while the parent record is retained.

## Agent Definitions and Operational Notes

> [!WARNING]
> Upstream discovers built-in and custom agents across global, workspace, and project directories (this package bundles no private agents, sessions, or memory). Review each agent's `model`, remove unwanted definitions, and avoid naming custom agents `general-purpose`, `Explore`, or `Plan`. Reload Pi after changing agent files, discovery scopes, or trust settings.

- **Model inheritance & session resume** — Built-in `Explore` inherits the parent session's model unless overridden in an agent file. Resuming an agent preserves the model and thinking level recorded in its saved session (even across reloads or cleanup); edits to an agent definition apply to newly launched agents. See the [upstream changelog](https://github.com/tintinweb/pi-subagents/blob/master/CHANGELOG.md) for unavailable-model fallback rules.
- **Nested delegation & concurrency limits** — Built-in `general-purpose` can delegate outside workflows within upstream depth and concurrency limits (a custom `general-purpose` file without `allowed_subagents` keeps delegation disabled). Agents with `allowed_subagents` share a default cap of `10` concurrent nested children (`/agents → Settings → Max nested concurrency`, `0` = unlimited); excess nested spawns fail immediately rather than queuing. Top-level and workflow agents are exempt.
- **Settings file & prompt cache policy** — Settings save globally unless `.pi/subagents.json` already exists in the project (`Tab` switches the target file). `cacheRetention` defaults to `inherit` and can be set to `none`, `short`, or `long` (or overridden per agent via `cache_retention` frontmatter) without affecting the parent session's cache policy.
- **Worktrees** — A deleted worktree that contained uncommitted changes cannot be reopened; a clean removed worktree reopens in the main checkout.
- **Events, RPC & workflow validation** — Upstream [agent docs](https://github.com/tintinweb/pi-subagents), [events](https://github.com/tintinweb/pi-subagents#events), and [RPC v2](https://github.com/tintinweb/pi-subagents/blob/master/docs/rpc.md) cover top-level, nested, and workflow lifecycles. RPC snapshots report pending notifications and settling descendants, workflow bus payloads stay untruncated separately from notification text, and RPC `stop` waits up to 5 seconds by default for descendants to settle. Strict draft-07 `agent({ schema })` checks and failure diagnostics are documented in [workflows.md](https://github.com/tintinweb/pi-subagents/blob/master/docs/workflows.md).

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-subagents-lean | 273 |
| @tintinweb/pi-subagents | 8832 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Source and Development

Adapted from [kunkun9527/pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) over [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents), maintained in [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md). The upstream published runtime is installed as an exact dependency without copying engine code; both projects are MIT-licensed (`LICENSE` preserved).

See the [maintenance policy](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md) and [MAINTENANCE.md](MAINTENANCE.md) for `dist` entrypoint contracts and child-context bridge details.
