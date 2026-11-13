# @gfgghgftgffg/pi-subagents-lean

[简体中文](README.zh-CN.md)

## Advantage

A lighter wrapper for [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents). Agent, result, steer and workflow calls share one `subagent` tool, cutting the tool text sent on the first call by about 97%.

## Features

- `run`, `result`, `steer`, `workflow` and `help` go through that one tool. Background tasks, workflows, schedules and the original result cards still use the upstream runtime.
- Cold parameters go in `input` as a JSON object string. The wrapper checks them against the real upstream schema before the call. `help` returns that schema.
- `subagent_type` lists the agent types enabled at startup. Reload after changing agent files. If the upstream description cannot be parsed, call `help` with `input` set to `"run"`.
- FleetView lists nested agents under their parent and shows each agent's own tokens. Its cursor is `❯`; `●` marks the open view. With `showModel` enabled, fleet rows also name the model and thinking level.
- Adds a read-only child-session interface so `pi-goal-x-lean` can keep goal management in the parent Agent.

## Source

The facade comes from [kunkun9527/pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean). The runtime is [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents). This package follows upstream releases and does not copy the engine. Both are MIT; the original `LICENSE` is kept. It lives in [amox-pi-extensions-lean](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md).

## Usage

Start an agent:

```json
{
  "op": "run",
  "prompt": "Find the implementation of the cache key.",
  "description": "Locate cache key",
  "subagent_type": "Explore",
  "run_in_background": true
}
```

Read a finished result. Use the `agent_id` from `run`, or a saved handle after reload:

```json
{ "op": "result", "agent_id": "agent-id" }
```

Send a new instruction to an agent that is still running:

```json
{ "op": "steer", "agent_id": "agent-id", "message": "Also check the tests." }
```

Run a workflow. Put its parameters in `input` as JSON text:

```json
{ "op": "workflow", "input": "{\"name\":\"review-panel\"}" }
```

See the full parameter list for one operation:

```json
{ "op": "help", "input": "run" }
```

## Installation

This is a public npm package. Install without a version pin:

```bash
pi install npm:@gfgghgftgffg/pi-subagents-lean
pi update --extensions
```

For a Git fallback, run from the repository checkout:

```bash
node scripts/install-extension.mjs pi-subagents-lean
```

Update a local Git installation by pulling the checkout and rerunning its installer; `pi update` does not update local contents. Keep one installation source. To migrate, back up settings, remove only the exact old source shown by `pi list`, then install the npm source. Do not load another `pi-subagents` wrapper alongside it.

For optional goal integration, also install or update [`pi-goal-x-lean`](../pi-goal-x-lean/README.md) with `pi install npm:@gfgghgftgffg/pi-goal-x-lean`.

## Important: review your agent definitions

Upstream discovers built-in and custom agents in global, workspace and project directories. This package does not ship private agents, sessions or memory. After install, check each agent's `model`, remove types you do not want, and avoid names that collide with `general-purpose`, `Explore` and `Plan`. Built-in Explore inherits the session model unless the agent file sets one.

A removed worktree that held changes cannot be reopened; a clean one reopens in the main checkout. Background tasks notify the parent when they finish. Agents with `allowed_subagents` share a default limit of 10 running nested children; excess nested spawns fail instead of queuing. Top-level and workflow agents are outside this limit. Configure it through `/agents → Settings → Max nested concurrency` (`0` means unlimited). Agent files, workflows, worktrees and `subagents.json` are documented [upstream](https://github.com/tintinweb/pi-subagents); integrations use its [events](https://github.com/tintinweb/pi-subagents#events) and [RPC](https://github.com/tintinweb/pi-subagents/blob/master/docs/rpc.md). Reload after changing agent definitions, discovery or trust settings. Behavior notes are in the [changelog](https://github.com/tintinweb/pi-subagents/blob/master/CHANGELOG.md).

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-subagents-lean | 270 |
| @tintinweb/pi-subagents | 8417 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Development

See the [development and maintenance guide](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md) and [MAINTENANCE.md](MAINTENANCE.md) for adaptation details.
