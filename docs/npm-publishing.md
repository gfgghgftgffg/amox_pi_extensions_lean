# npm publishing

[简体中文](npm-publishing.zh-CN.md)

All three extension packages are public on npm. [Release](../.github/workflows/release.yml) publishes verified GitHub Release archives through OIDC; users only need the README installation commands.

## Independent package releases

Each npm package has its own version. The private root version and GitHub `vX.Y.Z` tag identify a release batch, not a shared npm version. The protected `maintenance/manifest.json` release selection records the batch version, exact base commit and selected package IDs. Only selected packages are version-bumped, packed and published; unchanged packages keep their versions and are not queried or uploaded. `assets.json` records each archive’s own package version.

Local checks, exact-head three-platform CI and independent Release verification use the same affected-package scope. Shared code/dependency changes expand verification without automatically publishing unaffected packages.

## Publishing configuration

Each package needs its own npm Trusted Publisher: `@gfgghgftgffg/pi-web-access-lean`, `@gfgghgftgffg/rpiv-todo-lean`, and `@gfgghgftgffg/pi-subagents-lean`.

| Field | Value |
| --- | --- |
| GitHub owner | `gfgghgftgffg` |
| Repository | `amox_pi_extensions_lean` |
| Workflow filename | `release.yml` |
| Environment | `release` |
| Allowed actions | Direct `npm publish`, not stage-only |

These connections are already in use. Keep GitHub's `release` environment restricted to `main`, without human approval for unattended releases. Managing npm trust requires maintainer access and interactive 2FA; routine OIDC publication does not. A [new connection](https://docs.npmjs.com/trusted-publishers/) must complete its first successful publish within **2 days**. Do not repeat setup when moving the VPS.

Only the npm job has `id-token: write`; it has read-only repository access and installs no extension dependencies. [The publisher](../scripts/publish-npm.mjs) validates the source SHA, tag, archive contents and registry integrity. Root `package.json` remains private. Pi, systemd and Actions Secrets need no npm token.

## Failure recovery

Each missing archive is submitted once with `--ignore-scripts --fetch-retries=0`, followed by a shared ten-minute GET-only visibility check. Matching existing versions skip; integrity conflicts or uncertain writes stop. Never blindly repeat an upload, overwrite a version or move `latest` backwards.

Inspect the exact Release run and the selected packages’ registry versions first. After resolving the cause, use **Re-run failed jobs** on the same run within artifact retention (7 days). Do not start a new full Release for an existing tag. If artifacts expired, recover from verified GitHub Release assets, checking identity and hashes before any write; do not repack a working tree. GitHub Release success alone does not prove npm publication succeeded.

A manual Release is only for an unreleased tag matching the root batch version and the protected release selection; each selected package must match its own manifest version, independently of that tag. Rollback does not retract npm versions; publish a higher repair version.

## New VPS checklist

1. For ordinary Pi use, follow [bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md), using unpinned npm sources. Run `pi update --extensions` when needed; publication does not update personal installations. Use Git fallback only on confirmed public-registry 404, not authentication or network errors.
2. Migrate existing local sources only with user approval: back up settings, identify exact sources with `pi list`, remove those entries, install npm sources, and restart. Keep one facade per tool and preserve unrelated configuration.
3. To run daily maintenance, follow [Linux host deployment](local-scheduler.md). Configure that host's model, GitHub and SSH access separately; do not copy credentials or sessions through Git. Stop the old VPS timer before enabling the new one.
4. GitHub remains the npm publisher. A VPS move requires no new npm credentials or trust connection; preserve the repository/workflow/environment identity and check the next Release's npm job.
