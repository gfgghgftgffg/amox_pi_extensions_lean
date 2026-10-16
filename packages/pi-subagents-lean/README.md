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

Source review and test scope are recorded in [MAINTENANCE.md](MAINTENANCE.md).

## Reviewed upgrade: 0.21.0 → 0.22.0

The four tool names, fields, required parameters, execution/render signatures, and invocation
defaults remain compatible; the lean entry is unchanged. The default `smart` join mode now
reports completed tasks at the parent's next boundary without waiting for siblings; `async`
has the same behavior. A busy parent receives completions from its tool batch in one message;
an idle parent gets a turn after about 200 ms, combining completions within that window.
Use the `group` join setting to wait for a turn's batch; a lone spawn and different parent
turns are not grouped. A pending completion survives Esc and starts a turn after the interrupted
run ends. Reading a finished result suppresses its notification any time before delivery.

Installed Pi packages can declare agents and workflows under `pi.subagents` or `pi-subagents`.
Package resources are enabled by default and rank below your own definitions; packages configured
only by an untrusted project are invisible. `packageAgents` and `packageWorkflows` accept `true`,
`false`, or a package allowlist in `subagents.json`. Package agents are read-only in `/agents`,
with Eject/Disable actions. Reload after changing discovery/trust settings to refresh the facade's
startup type list. Shutdown now also disposes widget, group-join, and completion-outbox state.

The candidate check captures current character measurements and runs the existing facade and
integration regressions, typechecks, production installs, and audits in a separate sandbox.
Live model/MCP and interactive notification timing are outside those checks; release requires
human review after three-platform CI.

## Current lean-author review

The author update's typebox v1 imports, `instancePath` error locations and shared fallback description
are already implemented here. Routes, field precedence, validation and rendering stay compatible;
no adapter rewrite is needed. The engine remains npm stable 0.22.0; newer unpublished remote HEAD is
not adopted. Author Pi 1.2 benchmarks and packaging changes are kept separate from this repository's
own capture. Exact revisions and itemized reuse decisions are in MAINTENANCE.md.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/pi-subagents-lean | 0.1.3 | 270 |
| @tintinweb/pi-subagents | 0.22.0 | 8415 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Versions

* Wrapper: `0.1.3`
* Upstream runtime: pinned to `@tintinweb/pi-subagents@0.22.0` (exact)
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
