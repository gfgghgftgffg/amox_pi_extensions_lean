# npm publishing and VPS migration

[简体中文](npm-publishing.zh-CN.md)

The [Release workflow](../.github/workflows/release.yml) publishes verified archives to npm after a reviewed release. Maintainers must initialize publication before npm delivery is available; until then, extension users can use the Git installer. A successful GitHub Release does not by itself prove npm publication succeeded.

## Release boundary

A maintainer reviews and merges a version bump. Release checks the same immutable SHA on Linux, macOS and Windows, creates the GitHub Release, then sends its three verified archives to npm. No-update maintenance runs do not publish. Root `package.json` remains private.

Only the npm job has `id-token: write`. It runs on GitHub-hosted Ubuntu under environment `release`, with read-only repository access, Node 22.22.1 and npm 11.15.0. It installs the fixed npm CLI, not extension dependencies. [The publisher](../scripts/publish-npm.mjs) checks SHA/tag, archive hashes, package identity, repository and all six packaged files, then preflights all three public registry versions. It publishes the `.tgz` files with `--ignore-scripts` and `--fetch-retries=0`, disabling lifecycle scripts and npm HTTP retries. It checks registry integrity and the resulting `latest` tag after each new publish. GitHub trusted publishing generates provenance automatically. No npm token belongs in Pi, systemd, this repository or Actions Secrets.

## Maintainer publishing setup

This section is for package maintainers. Extension users only need the installation commands in the README; they do not need npm publishing credentials or trusted-publisher configuration.

The first publication requires package publishing rights and must use the **existing verified GitHub Release archives**, not a newly packed working tree:

- `@gfgghgftgffg/pi-web-access-lean`
- `@gfgghgftgffg/rpiv-todo-lean`
- `@gfgghgftgffg/pi-subagents-lean`

Validate all three archives against the matching release tag and `assets.json` before publication. After each publish, compare its exact version's public registry `dist.integrity` with the manifest and check `dist-tags.latest`. npm versions cannot be overwritten. If a write fails ambiguously, inspect the registry before any explicit retry. Do not publish the private workspace root.

Once the packages exist, configure **each of the three packages** under npmjs.com → package → Settings → Trusted Publisher → GitHub Actions. Trusted-publisher configuration requires maintainer access and account-level 2FA:

| Field | Value |
| --- | --- |
| Organization or user (GitHub owner) | `gfgghgftgffg` |
| Repository | `amox_pi_extensions_lean` |
| Workflow filename | `release.yml` (not its full path) |
| Environment name | `release` |
| Allowed actions | Explicitly allow direct `npm publish`; stage-only permission is insufficient |

Configure GitHub's `release` environment to allow only `main`, adding human approval if desired. Approvals may be requested for both publication jobs. After OIDC works, choose npm's “Require two-factor authentication and disallow tokens” and revoke unused publishing tokens. Forks or repository/workflow/environment renames need corresponding package metadata and new trust configurations; cloning a VPS does not grant npm publishing authority.

Official [trusted-publishing documentation](https://docs.npmjs.com/trusted-publishers/) requires a new trust configuration to complete its **first successful publish within 2 days**. Configure it close to the next reviewed version release; an already-published-version skip, dry run or login-state check does not validate OIDC. If it expires, delete and recreate the trust configuration before that release. Do not reuse the initial version or bump versions solely to disguise missing setup. The first actual OIDC release remains unverified until it succeeds on GitHub.

## Partial publication and recovery

All three registry versions are checked before any write. Existing versions with matching integrity are skipped; different content at the same version is rejected. Missing first packages, lookup failures and attempts to move `latest` backwards stop publication. An ambiguous publish failure is not retried and later packages are not published.

Inspect the exact run, all three registry versions and hashes first. Within artifact retention (7 days), explicitly **Re-run failed jobs** on the same Release run after resolving the cause. Completed identical packages are skipped. Do not start a new manual full Release for an existing tag: the GitHub release job intentionally refuses to retag or overwrite an existing release. If artifacts expired, use the verified GitHub assets and a maintainer-controlled manual recovery, checking identity and integrity first. Never unpublish or rewrite tags to force success. Unexpected registry `latest` tags require manual review rather than automatic tag changes.

## New VPS checklist

1. For normal Pi use, follow [bootstrap setup](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md). Use the three unpinned `npm:@gfgghgftgffg/...` sources once available, then `pi update --extensions`. If npm returns 404, use the per-extension Git installer. Preserve upstream dependency pins; do not register upstream engines separately.
2. Migrate old local sources only with the user's approval: back up settings, `pi list`, `pi remove <exact-old-source>`, then install the corresponding npm source. Keep unrelated packages and credentials. Restart Pi and verify one `web_access`, one `todo`, and one `subagent` tool. Local Git installations still require `git pull --ff-only` and rerunning the installer.
3. Running daily maintenance is optional and separate. Follow [local scheduler deployment](local-scheduler.md): install Linux prerequisites and root dependencies, render the systemd unit for the actual user/paths, and create fresh host-local model config, repository-scoped GitHub PAT and SSH access. Keep model, GitHub and npm credentials separate; do not copy secrets, sessions or model logs through Git.
4. Disable the old VPS timer before enabling the new one. Check the clock/timezone, state-directory permissions, disk-backed TMPDIR and bubblewrap restrictions. Run read-only `--dry-run` first; choose at most one authorized real verification run before enabling the daily 02:23 UTC timer. A successful no-update check does not test a paid model adaptation. Do not mechanically run multiple paid checks.
5. A VPS move does not move npm trusted publishing: GitHub remains the publisher. Keep workflow/environment identity unchanged, retain three-platform CI and human review, and verify both the next GitHub Release and npm job rather than assuming a green CI job means publication succeeded.
