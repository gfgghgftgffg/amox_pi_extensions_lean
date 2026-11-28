# npm Publishing and Recovery Guide

[简体中文](npm-publishing.zh-CN.md)

The repository contains six independent extension packages, and the [Release workflow](../.github/workflows/release.yml) publishes the verified `.tgz` archive of each released package to public npm via GitHub OIDC Trusted Publishing. Always check the corresponding Release's npm job and public npm metadata for package availability. Any newly introduced package must complete the first-publication bootstrap below before unattended OIDC publishing can run.

## Independent Package Releases

- **Per-package versioning & tags** — Every npm package tracks its own version and publishes under its own `<packageName>@<version>` Git tag and GitHub Release. The root monorepo `package.json` stays `"private": true` at `0.0.0` and never identifies a release.
- **Selective packing & upload** — A package becomes a release candidate only when its version advances past its latest `<packageName>@<version>` tag (packages without a dedicated tag fall back to the newest legacy `vX.Y.Z` batch tag as their initial baseline). Untouched packages are neither packed, queried against the registry, nor re-uploaded, and `.release-assets/assets.json` records each archive's exact package version and hashes.
- **Unified verification scope** — Local checks, exact-head three-platform PR CI, and Release verification share the same change-scope analyzer. When a `main` push carries release candidates, Release acts as the sole three-platform verifier for that merged SHA while ordinary `main`-push CI delegates instead of running a duplicate matrix (non-release pushes to `main` still run standard CI). Changes to shared scripts or dependencies widen verification coverage without publishing unaffected packages.

## Trusted Publisher Configuration

Configure a separate npm Trusted Publisher connection for each of the six packages:

- `@gfgghgftgffg/pi-web-access-lean`
- `@gfgghgftgffg/rpiv-todo-lean`
- `@gfgghgftgffg/pi-subagents-lean`
- `@gfgghgftgffg/pi-goal-x-lean`
- `@gfgghgftgffg/amox-pi-sync`
- `@gfgghgftgffg/amox-high-level`

| Setting | Required Value |
| --- | --- |
| GitHub owner | `gfgghgftgffg` |
| Repository | `amox_pi_extensions_lean` |
| Workflow filename | `release.yml` |
| Environment | `release` |
| Allowed actions | Direct `npm publish` (not stage-only) |

Keep existing connections intact; each new package needs a separate connection after its first publication below. Restrict GitHub's `release` environment to the `main` branch without manual approval gates so reviewed merges publish unattended. Editing npm Trusted Publisher settings requires maintainer privileges and interactive 2FA, whereas routine OIDC releases require no stored tokens anywhere in Pi, systemd, or GitHub Actions Secrets.

> [!IMPORTANT]
> A newly created [npm Trusted Publisher connection](https://docs.npmjs.com/trusted-publishers/) must complete its first real OIDC publish within **2 days** of creation. Migrating the maintenance Linux VPS does **not** require reconfiguring npm trust.

**Least-privilege job isolation:** Only the final `npm` job in `release.yml` receives `id-token: write`, paired with `contents: read` and zero workspace dependency installation. [scripts/publish-npm.mjs](../scripts/publish-npm.mjs) verifies the checkout SHA, release tag, archive file inventory, and registry SHA-512 integrity before invoking `npm publish`.

## First publication (goal example)

Because the OIDC publisher rejects a missing npm package identity before any uploads, it cannot bootstrap a brand-new package name on `registry.npmjs.org` by itself.

1. **Produce a verified release archive** — Introducing or bumping an untagged package on `main` (or dispatching a manual Release with its `<packageName>@<version>` tag) runs three-platform verification and builds the release asset. Download that verified `.tgz` archive, verify its package name, version, commit SHA, and SHA-256 / SHA-512 hashes (never repack a local working tree), and export its path as `ARCHIVE`.
2. **Publish the initial archive interactively** — As a maintainer with interactive npm authentication and 2FA, publish that exact archive once:

   ```bash
   npm publish "$ARCHIVE" --access public --tag latest --ignore-scripts --fetch-retries=0 --registry=https://registry.npmjs.org/
   ```

   Inspect public registry metadata afterward to confirm the published version, `dist.integrity`, and `latest` dist-tag match your verified archive (if the command outcome is ambiguous, check the registry before attempting any retry).
3. **Bind the Trusted Publisher & exercise OIDC** — Open `@gfgghgftgffg/pi-goal-x-lean`'s package settings on npm and add its Trusted Publisher using the table above. Once the initial version is visible on the public registry, run **Re-run failed jobs** on the original Release workflow: the script will see the matching `dist.integrity`, skip re-uploading that archive, and finish any remaining planned packages. Note that this idempotent skip does not exercise OIDC trust — publish the next reviewed version of that package within **2 days** so the new OIDC connection completes its first live upload inside npm's activation window.

## Failure Recovery and Manual Releases

- **Single-shot uploads & bounded polling** — Each unpublished archive is submitted once with `--ignore-scripts --fetch-retries=0`, followed by a shared 10-minute `GET`-only registry visibility wait. Existing versions whose `dist.integrity` matches are skipped cleanly; hash mismatches, `latest` tag anomalies, or ambiguous write failures halt immediately. Never force-overwrite a version, blindly re-run `npm publish`, or move `latest` backwards.
- **Recovering a failed Release run** — Always inspect both the failed GitHub Actions log and public npm metadata first (a green GitHub Release job alone does not mean the downstream `npm` job succeeded). Once the underlying issue is resolved, click **Re-run failed jobs** on that exact workflow run within the 7-day artifact retention window rather than dispatching a brand-new Release for an existing tag. If workflow artifacts have already expired, recover using the verified `.tgz` attached to the GitHub Release after checking its identity and hashes — never repack from a local checkout.
- **Manual workflow dispatch & rollbacks** — Triggering `release.yml` manually accepts either a single unreleased `<packageName>@<version>` tag matching the current `main` version (and newer than any prior tag) or an empty input to release all packages currently ahead of their last tag. Every planned tag must have a matching summary block in `maintenance/update-report.md`. Because published npm versions are immutable, rollbacks never retract registry versions — ship a higher patch version instead.

## Host Migration (New VPS Checklist)

1. **Everyday Pi installations** — Set up workstations using [amox-agent-bootstrap](https://github.com/gfgghgftgffg/amox-agent-bootstrap/blob/main/setup_for_pi.md) with unpinned `npm:` sources, and run `pi update --extensions` whenever you want updates (registry publication does not update personal installations automatically). Fall back to local Git installation only on a confirmed public-registry `404`, never on transient network or auth errors.
2. **Migrating legacy local extension paths** — Obtain user approval first, back up Pi settings, inspect exact active entries via `pi list`, remove only the superseded local entries, install the `npm:` packages, and reload Pi — keeping a single facade per tool while preserving unrelated settings.
3. **Moving the daily maintenance scheduler** — Follow the [Linux scheduler deployment guide](local-scheduler.md) on the new host, provisioning its model API key, fine-grained GitHub PAT, and SSH key independently (never sync credentials or session state through Git). Disable the systemd timers on the old VPS before enabling them on the new one.
4. **Keep OIDC trust untouched** — Because GitHub Actions (not the VPS) performs npm publication, moving the maintenance host requires zero new npm tokens or Trusted Publisher edits; keep the repository, `release.yml`, and `release` environment names unchanged and verify the next Release's `npm` job.
