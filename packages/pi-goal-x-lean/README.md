# pi-goal-x-lean

[简体中文](README.zh-CN.md)

A lightweight wrapper over [pi-goal-x](https://github.com/tmonk/pi-goal-x). The upstream engine is not copied. Compatible with [@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) and its workflows via `pi-subagents-lean`.

## Features

- Keeps upstream tools, commands, UI, settings and goal-file formats.
- Adds a small integration layer that keeps goals in the parent session and waits for tracked Agent/workflow results before automatic continuation or completion.

## Installation

Requires Pi `>=1.4.0 <2.0.0` and Node `>=22.19.0`. Install without a version pin:

```bash
pi install npm:@gfgghgftgffg/pi-goal-x-lean
pi update --extensions
```

Goal works alone. For subagents integration, also run `pi install npm:@gfgghgftgffg/pi-subagents-lean`. Keep one source per extension; do not separately load upstream `pi-goal-x`.

For a Git checkout, use `node scripts/install-extension.mjs pi-goal-x-lean`.

## Usage

```text
/goal Add CSV export to reports, with tests and usage documentation.
```

Confirm the plan to start. Use `/goal-direct` for direct creation, `/sisyphus` for ordered steps, `/goal-tweak` to revise, and `/goal-pause` / `/goal-resume` to pause or resume. See the [upstream guide](https://github.com/tmonk/pi-goal-x#readme) for all commands.

## Context footprint (character proxy)

<!-- amox-measurement:start -->
| Package | Registered character proxy |
| --- | ---: |
| @gfgghgftgffg/pi-goal-x-lean | 1535 |
| pi-goal-x | 2096 |

Fixed ceil(characters / 4), not provider billing tokens.
<!-- amox-measurement:end -->

## Maintenance

See [MAINTENANCE.md](MAINTENANCE.md) for integration scope, concurrency limits, side effects and upgrade checks.
