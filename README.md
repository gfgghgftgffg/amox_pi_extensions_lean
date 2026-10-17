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

Supports macOS, Windows, and Linux. Requires Pi `>=1.1.0`, Node `>=22.19.0`, and npm; the Git fallback also needs Git.

### npm installation and updates

After the maintainer completes the [one-time npm setup](docs/npm-publishing.md), install only the extensions you want, without version pins:

```bash
pi install npm:@gfgghgftgffg/pi-web-access-lean
pi install npm:@gfgghgftgffg/rpiv-todo-lean
pi install npm:@gfgghgftgffg/pi-subagents-lean
pi update --extensions
```

If a package is not yet published (npm returns 404), use the Git fallback below. Authentication or network failures are not evidence that a package is missing. `pi update --extensions` updates unpinned npm sources, not local directory contents. For an existing local installation, back up settings, use `pi list`, remove only the exact old source with `pi remove <old-source>`, then install its npm source. Restart Pi and confirm each tool loads once. Do not register both sources.

For a new VPS, follow [amox-agent-bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md). The [deployment checklist](docs/npm-publishing.md#new-vps-checklist) separates extension installation from optional maintenance-host deployment.

### Git fallback

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

The Git installer remains available before npm setup is complete and for fixed-tag installations.

Keep only one installation source for each extension to avoid duplicate registration with upstream packages or older `@ssk_dev/*-lean` installations. Find old sources with `pi list` and remove them with `pi remove <旧来源>`.

## Automated maintenance

You do not need to configure Actions to install or use these extensions. Maintenance runs locally: every day at 02:23 UTC (10:23 Beijing time), systemd starts a one-shot Pi process. In a temporary working copy, Pi checks upstream updates, adapts the wrappers, runs actual checks, and fixes the same candidate using failure output. It makes no model calls when there are no upstream updates or a maintenance PR is already open.

Source code and configuration for the daily task:
- [Maintenance entry point](scripts/local-maintenance.mjs) · [Independent Pi SDK session](scripts/lib/local-pi.mjs)
- [Daily update prompt (the original author's maintenance text)](maintenance/daily-update.md)
- [systemd service](scripts/systemd/amox-pi-actions.service) · [Daily timer](scripts/systemd/amox-pi-actions.timer)

The task uses an independent Pi session, not a subagent. That session does not load the extensions it maintains; only the separate check sandbox loads them. It does not update your current personal installation.

Once local checks pass, the fixed host script creates a non-draft maintenance PR. After Linux, macOS, Windows and `all-platforms-pass` succeed for that exact PR head, the host rechecks the PR identity, CI result and unchanged base/main, then merges it once using a head-SHA condition. It does not merge unrelated PRs, bypass failed checks, retry an uncertain merge, or push directly to main. Release independently checks the merged SHA on all three platforms before publication. Publication credentials remain isolated from candidate execution. See [local daily maintenance](docs/local-scheduler.md) for setup and recovery.

The repository keeps two GitHub workflows:

| Workflow | Trigger | Work |
| --- | --- | --- |
| CI | Pushes to `main`, PR updates, or manual runs | Tests, contract checks, independent installation verification, and security audits on all three platforms |
| Release | Release-related files change on `main`, or a manual run | When the shared wrapper version increases or a valid tag is specified, verify on all three platforms, publish three separate `.tgz` archives and a hash manifest, then publish those verified archives to npm |

CI and Release do not call a model, and there is no GitHub cron. Model configuration and GitHub/SSH credentials stay on the maintenance host; maintenance-model Actions Secrets/Variables are not required. Release notes reuse the local Pi session's specific change summary, with no further model call during publication.

For an initial release or a retry, you can run Release manually. The `tag` must match the versions in the root package.json, all three packages, and the manifest. Publishing uses the `release` environment, which can be restricted to `main` and configured to require approval. The separate npm job has OIDC permission, not GitHub write permission; it does not install or execute extension dependencies. First publication and trusted-publisher configuration require the maintainer's [one-time setup](docs/npm-publishing.md). No npm token is stored on the VPS.

Maintainers update the development SDK and Action SHAs separately; security audits remain enabled. See the [maintainer documentation](docs/maintenance.md) for development commands and the automatic-merge policy.

## Sources

Based on kunkun9527's [pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean), [rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean), and [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean). The wrapping method follows the [original lean guide](https://github.com/kunkun9527/my-lean-pi-setup/blob/main/docs/make-your-own-lean.zh-CN.md). Upstream implementations are pinned as exact-version dependencies; they are not copied, and `node_modules` is not modified.

License: [MIT](LICENSE).
