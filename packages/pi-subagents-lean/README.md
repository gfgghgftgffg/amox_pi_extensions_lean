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

Preferred: install the whole monorepo as one Pi package (Git install):

```bash
pi install git:git@github.com:gfgghgftgffg/amox_pi_extensions_lean.git
```

Standalone npm publishing of this workspace package is optional and not part of phase 1. Do not load
it alongside another `pi-subagents` wrapper.

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

## Context footprint (character proxy)

Measured in isolated Pi 1.1.0 print-mode sessions by [`scripts/capture-contracts.mjs`](../../scripts/capture-contracts.mjs)
(see [`maintenance/tool-contracts.json`](../../maintenance/tool-contracts.json)); estimator is a fixed
`ceil(characters / 4)` proxy, **not** provider tokenization or billing.

| Variant | Registered tools | Registered | Active at bind |
| --- | --- | ---: | ---: |
| Lean `@gfgghgftgffg/pi-subagents-lean@0.1.0` | `subagent` | **270** | **270** |
| Upstream `@tintinweb/pi-subagents@0.20.0` | `Agent` 2,533 + `SubagentWorkflow` 5,584 + `get_subagent_result` 158 + `steer_subagent` 159 | **8,415** | **8,415** |

## Versions

* Wrapper: `0.1.0`
* Upstream runtime: pinned to `@tintinweb/pi-subagents@0.20.0` (exact)
* Requires Pi `>=1.1.0` (upstream peer floor); tested with Pi `1.1.0`, Node `22.22.1`

## Development

Run from the repository root: `npm ci`, `npm run check`, `npm run contracts:check`.

## Maintenance

Adaptation points, pinned upstream metadata, upgrade steps, and limitations live in
[MAINTENANCE.md](MAINTENANCE.md).

## License

MIT. This package wraps the MIT-licensed
[`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents); upstream code is consumed as a
pinned npm dependency and is never copied into this repository.
