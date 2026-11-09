# Source review

## amox-pi-sync initial npm release

- Reviewed repository baseline: `3261d956499073196a22a725d0638e7c0b1f571f`, including the owner's standalone sync implementation and documented feature decisions.
- Upstream source remains the exact MIT npm publication `pi-sync-suite@0.1.1` (`npm:pi-sync-suite@0.1.1`). Its public npm SHA-512 archive was verified and parsed as 102 text files without installing or executing upstream code. No newer upstream publication was adopted for this release.
- The local `index.ts` and `core.ts` runtime implementation is unchanged. This is the first npm delivery of the existing fork, plus its selective-maintenance integration; it is not an automated upstream port. The local package advances from the already committed `0.1.0` source version to `0.1.1` under the existing release-selection gate.
- Retained scope: raw sessions/missions and safe selected agent data, manual/background sync, backups/restoration, diagnostics, manually confirmed backup cleanup, Starline capsule and fallback commands.
- Excluded scope remains excluded: configuration/settings merging, Markdown/JSON archives, environment installation, Local Packages and the upstream three-line widget. No runtime dependency on `pi-sync-suite` is introduced.

## Selective maintenance and acceptance

- New npm releases are detected separately from dependency-wrapper plans. Exact before/after npm archives are integrity-verified and read as untrusted text; moving Git HEAD is not a publication baseline.
- Read-only SDK review uses only list/read/submit_review, requires the owner's policy, local implementation and changed before/after files, and covers every changed published file with port/skip/ask decisions. Removed features cannot be automatically ported; retained or uncertain behavior cannot be silently skipped.
- A review-stage ask holds sync only. Stable skip/ask reports are cached by target, local implementation and policy; a later target still compares against the last integrated baseline. Invalid source or incomplete review asks the owner and is rechecked; explicit HTTP 5xx retains bounded two-hour retry handling.
- Only approved ports enable writes to index.ts/core.ts and scoped tests/docs. The local gate protects the owner's feature-decisions section, requires implementation changes and a focused regression, preserves append-only baseline assertions, and retains the existing sandbox/CI/merge boundaries.
- Newly discovered implementation uncertainty can invoke ask_owner. The host persists it, invalidates acceptance, retains the same candidate and stops further push/merge rather than rebuilding around failed checks. ntfy reports the decision without bypassing independent Release/npm verification for other packages.
- Release batch `0.1.17` selects only `amox-pi-sync@0.1.1`. Unchanged npm package versions remain web `0.1.15`, todo `0.1.13` and subagents `0.1.16`. Shared maintenance changes require full verification, not publication of unchanged packages.

## Validation boundaries

Regression coverage includes selection/versioning, archive integrity/path safety, cached skip/ask outcomes, mixed decisions, protected feature policy, required implementation/regression changes, post-review uncertainty, notification content/priority/size and preservation of Release/npm acceptance. Tests and production-loading checks use temporary data and isolated fixtures; they do not modify real sync settings, access personal sync remotes, invoke a paid model or send a real test notification.

PR CI must pass on the exact submitted SHA for Linux, macOS and Windows plus all-platforms-pass. Release must independently accept the merged SHA. The new package's first public npm publication and Trusted Publisher connection are separate checks; no success is claimed before registry integrity and the actual npm job are confirmed.
