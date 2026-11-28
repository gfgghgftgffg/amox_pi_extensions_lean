# amox-pi-extensions-lean

[![CI](https://img.shields.io/github/actions/workflow/status/gfgghgftgffg/amox_pi_extensions_lean/test.yml?branch=main&style=flat-square&label=CI)](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/actions/workflows/test.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19.0-3c873a?style=flat-square)](https://nodejs.org)
[![Pi](https://img.shields.io/badge/Pi-%3E%3D1.1.0-4f46e5?style=flat-square)](https://npmjs.com/package/@earendil-works/pi-coding-agent)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**Context-lean, independently installable extensions for the Pi coding agent.**

[简体中文](README.zh-CN.md) • [Extensions](#extensions) • [Installation](#installation) • [Development](#development) • [Attribution](#attribution)

Across the four lean packages, streamlined tool declarations reduce total registered tool contract footprint by **83.9%** (measured using the character proxy `ceil(characters / 4)`, counting all registered declarations, including those hidden from the model by Pi). For details, see the [tool-contract snapshot](maintenance/tool-contracts.json).

## Why Lean?

- **Minimal first-turn overhead** — Common parameters stay front-and-center; rare options move into on-demand `help` and JSON `input` passthrough.
- **Upstream runtime fidelity** — Lean wrappers depend on exact upstream releases rather than copying or diverging from engine logic.
- **Pick only what you use** — Every package versions, installs, and updates independently on Linux, macOS, and Windows.
- **Coordinated UX** — Targeted bridges let `pi-goal-x-lean` and `pi-subagents-lean` keep goal ownership in the parent session while waiting on background work, and hide `rpiv-todo-lean`'s panel while a session owns an active Goal. See the [integration boundaries](packages/pi-goal-x-lean/MAINTENANCE.md#subagents-and-workflow-integration-boundaries).

## Extensions

| Package | Surface | What it does | Host requirement |
| --- | --- | --- | --- |
| [pi-web-access-lean](packages/pi-web-access-lean/README.md) | `web_access` tool | Web search, claim verification, page fetching, stored-result pagination, and local PDF extraction | Pi `>=1.1.0` |
| [rpiv-todo-lean](packages/rpiv-todo-lean/README.md) | `todo` tool + `/todos` | Session-scoped task lists, dependencies, batch creation, and collapsible TUI progress panel | Pi `>=1.1.0` |
| [pi-subagents-lean](packages/pi-subagents-lean/README.md) | `subagent` tool | Background and inline subagents, steering, result inspection, and scripted workflows | Pi `>=1.1.0` |
| [pi-goal-x-lean](packages/pi-goal-x-lean/README.md) | `get_goal` + `goal` tools, `/goal*` | Persistent goals, milestone tracking, autonomous continuation, and completion auditing | Pi `>=1.7.0 <2.0.0` |
| [amox-pi-sync](packages/amox-pi-sync/README.md) | `/sync-*`, `/delete-session` (no model tools) | Raw agent-data sync over private SSH Git, deletion propagation, targeted session-tree deletion, orphan pruning, backups, and diagnostics | Pi `>=1.1.0`, Git + SSH |
| [amox-high-level](packages/amox-high-level/README.md) | `/hl*`, `+hl` (no model tools) | Display-only summary cards that stay out of future model context, with summary modes, thinking budgets, history, and Starline menu | Pi `>=1.6.0` |

## Installation

All packages support Linux, macOS, and Windows with Node.js `>=22.19.0` and npm. Install only the extensions you need, without version pins:

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi install npm:@gfgghgftgffg/pi-subagents-lean
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi install npm:@gfgghgftgffg/amox-pi-sync
pi install npm:@gfgghgftgffg/amox-high-level
```

Update installed npm extensions whenever needed:

```bash
pi update --extensions
```

> [!TIP]
> `pi-goal-x-lean` works standalone, or alongside `pi-subagents-lean` and `rpiv-todo-lean`. When pairing Goal with Subagents, install or update both npm packages together — see the [pi-goal-x-lean README](packages/pi-goal-x-lean/README.md) for details. Service API keys and per-extension settings are covered in each package's README, and full machine setup is documented in [amox-agent-bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md).

### Install from Source or an Exact Release Tag

To install from a local checkout — or pin an exact per-package release tag (`<packageName>@<version>`, such as `git checkout '@gfgghgftgffg/pi-goal-x-lean@0.1.4'`) — clone the repository and run the standalone installer for the target extension. Running `npm ci` at the repository root is not required:

```bash
git clone https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git
cd amox_pi_extensions_lean

node scripts/install-extension.mjs pi-web-access-lean
node scripts/install-extension.mjs rpiv-todo-lean
node scripts/install-extension.mjs pi-subagents-lean
node scripts/install-extension.mjs pi-goal-x-lean
node scripts/install-extension.mjs amox-pi-sync
node scripts/install-extension.mjs amox-high-level
```

To update a checkout-based installation later, run `git pull --ff-only` and re-run that extension's installer script.

## Development

- [Development checks and adaptation policy](docs/maintenance.md)
- [Linux maintenance-host scheduling and recovery](docs/local-scheduler.md)
- [OIDC npm publishing and recovery guide](docs/npm-publishing.md)

## Attribution

### Upstream Architecture and Sources

- **Lean wrappers (`web`, `todo`, `subagent`)** — Adapted from kunkun9527's [pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean), [rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean), [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean), and [lean extension guide](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md). Upstream engines are installed as exact npm dependencies rather than copied source.
- **`pi-goal-x-lean`** — Original facade authored in this repository over [tmonk/pi-goal-x](https://github.com/tmonk/pi-goal-x), keeping the upstream runtime as an exact dependency.
- **`amox-pi-sync`** — Selectively maintained standalone fork of [MuratAitov/pi-sync](https://github.com/MuratAitov/pi-sync) (`pi-sync-suite@0.1.1`, ref `npm:pi-sync-suite@0.1.1`, MIT Copyright (c) 2026 Murat). It does not install `pi-sync-suite`; never load both simultaneously.
- **`amox-high-level`** — Self-maintained derivative of [z472421519/pi-high-level](https://github.com/z472421519/pi-high-level), preserving original MIT copyright and design attribution.

> [!WARNING]
> Data synced by `amox-pi-sync` (sessions, missions, and custom paths) can contain API keys or sensitive project context. Always use a **private SSH Git repository** and review the safety boundaries in its README before syncing.

### Contributors

- **gfgghgftgffg** — Monorepo maintenance, packaging, and cross-extension integration
- **z472421519** — Original `pi-high-level` design and implementation
- **kunkun9527** — Original lean wrappers and lean design guide
- **MuratAitov** — Original `pi-sync`
- **tmonk** — Original `pi-goal-x`
- **tintinweb** — Original `pi-subagents`
- **juicesharp** — Original `rpiv-todo`
- **nicobailon** — Original `pi-web-access`

Released under the [MIT](LICENSE) License.
