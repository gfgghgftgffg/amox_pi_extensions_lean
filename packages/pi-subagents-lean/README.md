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

Once published to npm, install with `pi install npm:@gfgghgftgffg/pi-subagents-lean` (no version pin), then update with `pi update --extensions`. Before first publication (npm 404), use the Git installer above. Local installs are updated by pulling the checkout and rerunning that installer, not by `pi update`. To migrate, back up settings and remove only the exact old source shown by `pi list` before installing the npm source. Choose one installation method; do not load another `pi-subagents` wrapper alongside it.

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

## Runtime behavior and settings

Background agent, group and workflow completions use the steering queue without interrupting running
tools. `smart` and `async` joins report completed tasks at the parent's next boundary without waiting
for siblings. A busy parent receives one combined message after its tool batch; an idle parent gets a
turn after about 200 ms. Use `group` to wait for a turn's batch; a lone spawn and different parent
turns are not grouped. Pending notifications survive Esc, and reading a finished result before delivery
suppresses its notification.

A foreground spawn can move to the background with `ctrl+b` while the editor has focus (all foreground
spawns), or `b` in its viewer (one spawn). It returns an ID and later notifies on completion. The viewer
follows Pi's fullscreen and scrollbar settings.

Installed packages can declare agents/workflows under `pi.subagents` or `pi-subagents`. These resources
are enabled by default, rank below your own definitions, and are invisible if configured only by an
untrusted project. `packageAgents` and `packageWorkflows` in `subagents.json` accept `true`, `false` or
a package allowlist. Package agents are read-only in `/agents`, with Eject/Disable actions. Reload
after changing discovery or trust settings to refresh the facade's startup type list.

Agent-file `isolated` applies to workflow children, mentions and RPC spawns, overriding caller values.
File `isolation` also applies to mentions/RPC; a requested worktree requires a usable git repository.
Workflow worktrees remain controlled by script options. Children inherit parent project trust;
a different spawn directory does not become trusted automatically.

With `extensions: true`, children load builtin codemode, tool search and MCP, each with its own MCP
servers. Disable MCP with agent `exclude_extensions: builtin:mcp`, global `-builtin:mcp` or `--no-mcp`.
Child tool scope respects exposure/defaultActive and also checks nested `ctx.executeTool` calls.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Version | Registered character proxy |
| --- | --- | ---: |
| @gfgghgftgffg/pi-subagents-lean | 0.1.4 | 270 |
| @tintinweb/pi-subagents | 0.22.0 | 8415 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Versions

* Wrapper: `0.1.4`
* Upstream runtime: pinned to `@tintinweb/pi-subagents@0.22.0` (exact)
* Requires Pi `>=1.1.0`. Development test baseline: Pi `1.1.0`, Node `22.22.1`.

## Development

Run from the repository root: `npm ci`, `npm run check`, `npm run contracts:check`.

## Maintenance

Adaptation points, pinned upstream metadata, upgrade history, source-review decisions, and limitations
live in [MAINTENANCE.md](MAINTENANCE.md). This README describes current usage, not individual releases.

## License

MIT. This package wraps the MIT-licensed
[`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents); upstream code is consumed as a
pinned npm dependency and is never copied into this repository.
