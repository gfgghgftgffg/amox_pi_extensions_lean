# @gfgghgftgffg/pi-subagents-lean

Part of the [`amox-pi-extensions-lean`](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/README.md) monorepo. A lightweight Pi facade for
[`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents): the full subagent/workflow
runtime behind one `subagent` tool. Runtime updates follow upstream.

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

Background tasks notify the parent on completion; do not poll or sleep. See the
[upstream documentation](https://github.com/tintinweb/pi-subagents) for background execution,
workflows, worktrees and `subagents.json` settings. Reload the extension after changing agent
definitions, discovery or trust settings to refresh the facade's available type list.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-subagents-lean | 270 |
| @tintinweb/pi-subagents | 8415 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Development

See the [development and maintenance guide](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/blob/main/docs/maintenance.md) and [MAINTENANCE.md](MAINTENANCE.md) for adaptation details.
