# Upstream maintenance candidate

<!-- amox-maintenance-adapted; verification-pending -->

Base: `7a666d19d92f6e5d0d22a0b5d638645a079809a3`
Candidate version: `0.1.1`

## Changes

- `@tintinweb/pi-subagents`: `0.20.0` → `0.21.0`.
- `@juicesharp/rpiv-todo` and `@juicesharp/rpiv-i18n`: `2.13.5` → `2.13.8`.
- `pi-web-access` remains pinned to `0.39.0`.
- Facade entrypoints are unchanged. The agent updated package docs and added three regression tests; the independent generator updated versions, lockfile, manifest and measured contracts.

Source/API review: [agent-review.md](agent-review.md).

## Windows regression repair

[Original maintenance run](https://github.com/gfgghgftgffg/amox_pi_extensions_lean/actions/runs/38301888492) completed detection and model adaptation. Linux and macOS verification passed; Windows failed in the new workflow-isolation regression test before a PR could be created.

The test imported `agent-types.ts` directly while the upstream host imports `agent-types.js`. On Windows, jiti cached the resolved paths with different separators, creating two registries. The fixture registered `Hermetic` in one registry while the host read the other and fell back to `general-purpose`.

The test now uses the same `.js` import specifier as the upstream host. All assertions are retained; no production code, dependencies, workflow checks or platform coverage were weakened. No additional model adaptation was run.

## Verification status

After the repair, local Windows checks passed:

- Three new regression tests: 3 passed.
- Full typecheck/tests: 158 tests, 154 passed, 0 failed, 4 skipped for unavailable local file-symlink privileges.
- Contract snapshot check, all three standalone production installs, and both high-level npm audits passed; 0 vulnerabilities.

The earlier Linux/macOS results apply to the original proposal. This repaired PR requires fresh three-platform CI before merge. It has not been released.
