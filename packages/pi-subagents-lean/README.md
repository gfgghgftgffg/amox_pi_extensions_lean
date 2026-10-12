# @gfgghgftgffg/pi-subagents-lean

Part of the [`amox-pi-extensions-lean`](../../README.md) monorepo. A lightweight Pi facade for
[`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents): the full subagent/workflow
runtime behind one `subagent` tool.

Original lean facade by [kunkun9527](https://github.com/kunkun9527/pi-subagents-lean); upstream
extension by [tintinweb](https://github.com/tintinweb/pi-subagents). Both are MIT-licensed; the
original `LICENSE` is preserved in this package.

## Core features

* Full upstream runtime: agent discovery, spawning, background execution, result retrieval, mid-run
  steering, workflows, schedules, and lifecycle handling are upstream's own code.
* One provider-facing tool: `Agent`, `get_subagent_result`, `steer_subagent`, and `SubagentWorkflow`
  are routed through `subagent` with `op` values `run`, `result`, `steer`, `workflow`, plus `help`.
* Advanced parameters on demand: `input` carries a JSON object validated against the hidden real
  upstream schema before execution; `help` returns the complete current upstream schema.
* Available agent names: `subagent_type` shows the enabled types captured at extension startup.
  Reload the extension after changing agent definitions/settings; if an upstream description format is
  unrecognized, use `help` with `input: "run"`.
* Rendering delegated to upstream tools, so the original call/result cards are preserved.

## Installation

Install only this extension from the repository root (clone as shown in the root README):

```bash
node scripts/install-extension.mjs pi-subagents-lean
```

Once published to npm, `pi install npm:@gfgghgftgffg/pi-subagents-lean` is also available. Choose one installation method; do not load another `pi-subagents` wrapper alongside it.

## Usage

```json
{
  "op": "run",
  "prompt": "Find the implementation of the cache key.",
  "description": "Locate cache key",
  "subagent_type": "Explore",
  "run_in_background": true
}
```

* `result` with `agent_id` retrieves output from a finished task.
* `steer` with `agent_id` and `message` redirects a running agent.
* `workflow` runs a scripted multi-agent workflow; pass its parameters as JSON in `input`.
* `help` with `input` set to one operation returns that upstream tool's full description and schema.

## Important: review your agent definitions

The upstream runtime discovers built-in and custom agents across global, workspace, and project
directories. This repository does not package private agents, sessions, or memory, but it intentionally
preserves that discovery mechanism. After installation: review discovered agent definitions (especially
their `model` fields), remove unneeded types, adjust prompts/tools/allowlists, and watch for naming
collisions with the built-in `general-purpose`, `Explore`, and `Plan` types.

## Reviewed upgrade: 0.20.0 → 0.21.0

The four upstream tools, parameter schemas, defaults, and execution signatures are unchanged; the
lean entry is unchanged. Advanced options still go through `input` and `help`, and the session
continues to expose one `subagent` tool.

Background agent, group, and workflow completions now enter the steering queue: a busy parent sees
one after its current tool batch and before the next model call. Running tools are not interrupted.
A running foreground spawn can be handed to the background with `ctrl+b` while the editor has focus
(all foreground spawns), or `b` in its conversation viewer (one spawn); it returns an ID and later
notifies on completion. The viewer also follows Pi's fullscreen mode and scrollbar setting.

Agent-file `isolated` now applies to workflow children, mentions, and RPC spawns; file values override
caller values. File `isolation` applies to mentions/RPC too, and a requested worktree fails to start
outside a usable git repository. Workflow worktrees remain controlled by the script's option.
Children inherit the parent's project trust; a different spawn directory is not implicitly trusted.
With `extensions: true`, children load Pi's built-in codemode, tool search, and MCP, each with its
own MCP servers. Opt out with agent `exclude_extensions: builtin:mcp`, global `-builtin:mcp`, or
`--no-mcp`. Child tool scope respects exposure/defaultActive and also gates nested `ctx.executeTool`
calls.

Source review and test scope are recorded in [MAINTENANCE.md](MAINTENANCE.md). New offline regression
tests cover workflow isolation forwarding and child tool exposure/scope. Installation, tests, contract
capture, and production-install verification have **not run in this agent stage**; they belong to the
independent validation job. Release still requires human approval.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/pi-subagents-lean | 0.1.1 | 270 |
| @tintinweb/pi-subagents | 0.21.0 | 8415 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Versions

* Wrapper: `0.1.1`
* Upstream runtime: pinned to `@tintinweb/pi-subagents@0.21.0` (exact)
* Requires Pi `>=1.1.0` (unchanged upstream peer floor). Previous baseline testing used Pi `1.1.0`, Node `22.22.1`; candidate validation is pending in the independent job.

## Development

Run from the repository root: `npm ci`, `npm run check`, `npm run contracts:check`.

## Maintenance

Adaptation points, pinned upstream metadata, upgrade steps, and limitations live in
[MAINTENANCE.md](MAINTENANCE.md).

## License

MIT. This package wraps the MIT-licensed
[`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents); upstream code is consumed as a
pinned npm dependency and is never copied into this repository.
