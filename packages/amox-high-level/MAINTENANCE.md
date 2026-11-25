# Maintenance

## Scope

`amox-high-level` is a self-maintained derivative of [z472421519/pi-high-level](https://github.com/z472421519/pi-high-level). The original project is MIT licensed and remains the source of the base design and implementation.

This package adds:

- summary modes: manual, auto, minimum characters, minimum lines
- thinking-level selection for summary requests
- history browsing that opens even when empty
- a clickable pi-starline status menu with a native fallback
- inline prompt editing and config migration from `auto.enabled`

It intentionally keeps the display-only card model: cards never enter later model context.

## Upstream review

Upstream is reviewed manually. There is no automatic porting or release selection for this package. When reviewing an upstream change:

- keep the `/hl`, `/hl-status`, `/hl-history`, and `/hl-settings` command surface
- keep the `pi-high-level.json` config path for existing installations
- keep `fallbackMenu` opt-out behavior when pi-starline is absent
- keep the answer-token reserve beyond the thinking budget
- do not introduce Pi-wide settings or write global Pi configuration

来源记录不代表当前 CI/发布结果或现行审批要求。更新前应对比 manifest 中当前固定版本/revision 与目标源码。

## Verification

From the package directory:

```bash
npm run typecheck
npm test
```

From the repository root:

```bash
npm run check
```

The package has no model tools, so it has no tool-contract snapshot and is excluded from tool-character comparisons.
