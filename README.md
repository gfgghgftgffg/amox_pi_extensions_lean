# amox-pi-extensions-lean

[简体中文](README.zh-CN.md)

Lean wrappers for `pi-web-access`, `rpiv-todo`, and `pi-subagents`. They shorten tool descriptions and schemas, combine related tools, and provide full parameter documentation on demand. Execution still uses upstream code.

Based on character counts in the current [tool snapshot](maintenance/tool-contracts.json), the three extensions reduce total tool-context size by about **94.5%**. This is a character-based estimate, not actual billed model tokens.

## Extensions

| Extension | Tool | Purpose |
| --- | --- | --- |
| [pi-web-access-lean](packages/pi-web-access-lean/README.zh-CN.md) | `web_access` | Web search, claim verification, web page and PDF fetching, result pagination |
| [rpiv-todo-lean](packages/rpiv-todo-lean/README.zh-CN.md) | `todo` | Tasks, dependencies, and progress tracking |
| [pi-subagents-lean](packages/pi-subagents-lean/README.zh-CN.md) | `subagent` | Launch subagents, retrieve results, steer tasks, and run workflows |

Each extension installs independently. Upstream service credentials, external dependencies, and usage limits still apply; see each extension's README for details.

## Installation

Supports macOS, Windows, and Linux. Requires Pi `>=1.1.0`, Node `>=22.19.0`, npm, and Git.

```bash
git clone https://github.com/gfgghgftgffg/amox_pi_extensions_lean.git
cd amox_pi_extensions_lean
```

Run the commands for the extensions you want. Each command installs one extension:

```bash
node scripts/install-extension.mjs pi-web-access-lean
node scripts/install-extension.mjs rpiv-todo-lean
node scripts/install-extension.mjs pi-subagents-lean
```

You do not need to run `npm ci` at the repository root. To update, run `git pull --ff-only`, then rerun the relevant install command. For a fixed version, check out a published tag.

This project does not publish npm packages. Use the repository scripts above to install.

Keep only one installation source for each extension to avoid duplicate registration with upstream packages or older `@ssk_dev/*-lean` installations. Find old sources with `pi list` and remove them with `pi remove <旧来源>`.

## Automated maintenance

You do not need to configure Actions to install or use these extensions. Maintenance runs locally: every day at 02:23 UTC (10:23 Beijing time), systemd starts a one-shot Pi process. In a temporary working copy, Pi checks upstream updates, adapts the wrappers, runs actual checks, and fixes the same candidate using failure output. It makes no model calls when there are no upstream updates or a maintenance PR is already awaiting review.

Source code and configuration for the daily task:
- [Maintenance entry point](scripts/local-maintenance.mjs) · [Independent Pi SDK session](scripts/lib/local-pi.mjs)
- [Daily update prompt (the original author's maintenance text)](maintenance/daily-update.md)
- [systemd service](scripts/systemd/amox-pi-actions.service) · [Daily timer](scripts/systemd/amox-pi-actions.timer)

The task uses an independent Pi session, not a subagent. That session does not load the extensions it maintains; only the separate check sandbox loads them. It does not update your current personal installation.

Once local checks pass, the script creates a draft PR. Ordinary CI then checks it independently on Linux, macOS, and Windows. Release runs only after a maintainer reviews and merges the version bump. Pi does not push directly to main or merge PRs automatically. Publication credentials are isolated from the environment that executes candidate code. See [local daily maintenance](docs/local-scheduler.md) for deployment and troubleshooting.

The repository keeps two GitHub workflows:

| Workflow | Trigger | Work |
| --- | --- | --- |
| CI | Pushes to `main`, PR updates, or manual runs | Tests, contract checks, independent installation verification, and security audits on all three platforms |
| Release | Release-related files change on `main`, or a manual run | When the shared wrapper version increases or a valid tag is specified, verify on all three platforms and publish three separate `.tgz` archives and a hash manifest |

CI and Release do not call a model, and there is no GitHub cron. Model configuration and GitHub/SSH credentials stay on the maintenance host; maintenance-model Actions Secrets/Variables are not required. Release notes reuse the local Pi session's specific change summary, with no further model call during publication.

For an initial release or a retry, you can run Release manually. The `tag` must match the versions in the root package.json, all three packages, and the manifest. Publishing uses the `release` environment, which can be restricted to `main` and configured to require approval.

Maintainers update the development SDK and Action SHAs separately; security audits remain enabled. See the [maintainer documentation](docs/maintenance.md) for development commands and human review requirements.

## Sources

Based on kunkun9527's [pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean), [rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean), and [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean). The wrapping method follows the [original lean guide](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md). Upstream implementations are pinned as exact-version dependencies; they are not copied, and `node_modules` is not modified.

License: [MIT](LICENSE).
