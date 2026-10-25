# Local upstream maintenance

Base: eeda719e84344fa77f4c7833b121ed1c808a9bb7
Release after verified merge: v0.1.9

<!-- amox-release-summary:v0.1.9:start -->
- Upgrade todo/i18n from 2.13.9 to 2.15.0, preserving upstream atomic batch creation, error rendering and corrupt-snapshot replay.
- Retain every native task field while compacting equivalent schema constraints and keeping model-facing metadata within the original 1200-character ceiling.
- Update only the two explicitly approved obsolete contract expectations; preserve behavior assertions and add real-runtime schema equivalence and batch regressions.
- Keep web/subagent engines, Pi SDK/peer pins and personal installations unchanged.
- Apply the owner-authorized advisory policy consistently to daily maintenance, CI and Release: run both audits, record upstream findings as warnings, and keep functional failures and invalid audit reports blocking.
<!-- amox-release-summary:v0.1.9:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
