# amox-high-level

High-level summary cards for Pi: turn a long reply into a compact card you can revisit, without adding it to the next turn's context.

This project is a maintained derivative of [z472421519/pi-high-level](https://github.com/z472421519/pi-high-level). The original design and implementation are by z472421519; this version adds summary modes, thinking-level selection, history browsing, and a pi-starline status menu.

## Why

Long answers are useful once and noisy afterwards. `amox-high-level` records a short summary next to the reply you choose, then keeps that card out of later model context. You get a readable recap without paying for it on every turn.

## Features

- Display-only summary cards stored in the current session.
- Four summary modes: manual, auto, minimum characters, minimum lines.
- Separate thinking level for summary requests.
- Inline custom prompt with `{{question}}` and `{{answer}}` placeholders.
- Session history with open-original and regenerate actions.
- A clickable `HL` pill in pi-starline for status and actions.
- Native Pi menus as a fallback when pi-starline is unavailable.
- All settings live in one extension config file; no Pi-wide settings are changed.

## Install

Requires Pi 1.6.0 or newer and at least one authenticated model. pi-starline is optional.

From npm:

```bash
pi install npm:@gfgghgftgffg/amox-high-level
pi update --extensions
```

From the monorepo checkout:

```bash
git clone https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git
cd amox_pi_extensions_lean
node scripts/install-extension.mjs amox-high-level
```

See [MAINTENANCE.md](MAINTENANCE.md) for the maintenance boundary.

Run `/reload` after installing into an open session.

## Quick start

Mark the reply you want summarized with `+hl`:

```text
Refactor the parser and explain the trade-offs +hl
```

The marker is removed before the prompt is sent. When the reply finishes, Pi stores a high-level card in the session.

You can also summarize the latest reply after the fact:

```text
/hl
```

Existing cards are available through:

```text
/hl-history
```

Use `/hl-status` for the current state and actions, or `/hl-settings` to change the mode, model, thinking level, thresholds, timeout, and prompt.

### Example

Input:

```text
We need to cut cold-start latency in the image pipeline. Compare the two caching
approaches and recommend one, with the main trade-off. +hl
```

The reply may be long. The card is short:

```text
- Moved the decoded-image cache from disk to an in-process LRU.
- Cold starts now skip repeated decode work; memory grows with the active set.
- Trade-off: faster warm starts for a bounded increase in RSS.
```

Open `/hl-history` to read the full card, return to the original reply, or regenerate the summary with the current settings.

## Commands

| Command | Effect |
| --- | --- |
| `/hl` | Summarize the latest reply, or open its existing card in history |
| `/hl-status` | Show summary state and open the action menu |
| `/hl-history` | Browse cards in this session, including cards on other branches |
| `/hl-settings` | Choose the mode, model, thinking level, thresholds, timeout, prompt, and fallback menu |

`+hl` works in three ways:

- `your prompt +hl`: summarize the reply to that prompt.
- `+hl` alone while Pi is busy: arm or disarm the active reply.
- `+hl` alone while idle: summarize the latest reply.

Replies shorter than 160 characters and fewer than 4 non-empty lines are skipped.

## Summary modes

| Mode | Behavior |
| --- | --- |
| `manual` | Summarize only when you use `/hl` or `+hl` |
| `auto` | Summarize a completed reply when either threshold is met |
| `minChars` | Summarize only when the character threshold is met |
| `minLines` | Summarize only when the line threshold is met |

Character thresholds start at 200; line thresholds start at 4.

## Thinking level

Summary requests use their own thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.

Some providers count reasoning tokens against the output cap. This extension reserves 320 answer tokens beyond the thinking budget (`minimal` 1,024, `low` 2,048, `medium` 8,192, `high` 16,384), then clamps to the model's maximum. `xhigh` and `max` use the `high` budget; unsupported levels are clamped to the nearest supported level. These budgets are internal to the extension.

## Settings

All settings share `~/.pi/agent/pi-high-level.json`. Set `PI_CODING_AGENT_DIR` to use a different Pi agent directory.

```json
{
  "model": "auto",
  "thinking": "minimal",
  "mode": "manual",
  "timeoutMs": 18000,
  "auto": {
    "minChars": 1200,
    "minLines": 28
  },
  "prompt": "Write three concise bullets.\n\n{{answer}}",
  "fallbackMenu": true
}
```

- `model`: omitted or `current` uses the session model; `auto` prefers an authenticated Haiku, Flash, Mini, Nano, or Instant model; `provider/id` selects an exact model.
- `thinking`: reasoning level for summary requests.
- `mode`: one of `manual`, `auto`, `minChars`, `minLines`.
- `timeoutMs`: clamped to 3–120 seconds.
- `auto.minChars` / `auto.minLines`: thresholds used by the selected mode.
- `prompt`: optional inline replacement for the built-in instructions.
- `fallbackMenu`: use Pi's native select menus when pi-starline is unavailable. Defaults to `true`.

Configs written with the old `auto.enabled` field are migrated to `mode` automatically.

CLI flags override the saved model, mode, and thinking level for one launch:

```bash
pi --hl-model auto --hl-auto 1200c --hl-thinking low
```

## History

`/hl-history` lists cards from the current session only, including cards on other branches. The picker opens even when there are no cards, showing an empty list.

Selecting a card offers:

- **Open original**: navigate back to the assistant reply before its card. This moves the session position; new prompts continue from there.
- **Regenerate**: summarize that reply again with the current settings.

Cards support Ctrl+O expansion. In fullscreen mode, a left click also expands or collapses a card.

## pi-starline menu

With pi-starline installed, the `HL` status pill opens a bubble with the current state and actions:

- Summarize latest reply
- History
- Settings

Without pi-starline, the same actions are available through Pi's native menus. Set `fallbackMenu` to `false` to disable the native fallback; commands then show information only.

## Custom prompt

The built-in instructions are:

```text
Summarize the assistant's final answer at a high level.
Write 3 to 5 concise lines or bullets in the answer's language.
Focus on the conclusion, key decision/trade-off, and concrete change or next step.
Do not repeat intermediate steps, code blocks, or long file lists.
Do not add a title or preamble.
```

An inline prompt may contain `{{question}}` and `{{answer}}`. Without either placeholder, both XML-style blocks are appended. Question text is clipped to 1,200 characters, answer text to 16,000 characters, and custom instructions to 8,000 characters.

## How it works

Each summary is one extra provider request. The question and answer go to the configured summary provider, which may charge for the request and apply its own data policy. Only the resulting card is excluded from later model context; the original reply remains part of the session.

## Compatibility

- Pi 1.6.0 or newer.
- `registerEntryRenderer`, `navigateTree`, and an authenticated model.
- Linux, macOS, and Windows terminals supported by Pi.
- pi-starline 0.13.0 or newer for the status pill; not required.

## Development

From this package directory:

```bash
npm run check
```

From the repository root:

```bash
npm test
```

Tests load TypeScript through `jiti` and run on Node 22.19 or newer.

## Credits

Original project: [z472421519/pi-high-level](https://github.com/z472421519/pi-high-level), MIT License, Copyright (c) 2025 z472421519.

Maintained fork and additions: gfgghgftgffg.
