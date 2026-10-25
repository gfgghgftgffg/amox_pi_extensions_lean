# Local upstream maintenance

Base: eeda719e84344fa77f4c7833b121ed1c808a9bb7
Release after verified merge: v0.1.9

<!-- amox-release-summary:v0.1.9:start -->
- Consume todo/i18n 2.15.0 for atomic batch creation with tasks[], upstream JSON argument normalization, error-card fixes and robust saved-snapshot replay.
- Preserve the upstream schema and existing hook/RPC/render delegation; minimally correct compact create guidance and bilingual usage without changing action inference or removing rules.
- Add focused real-facade regressions for batch data fields, validation, atomic failures, persistence, RPC replay and rendering, using jiti's shared module cache so direct store reads and the facade share one runtime graph.
- Record exact before/after review and unchanged web/subagents releases and lean author revisions; recapture character proxies through the fixed checker.
- Preserve append-only baseline assertions. Their obsolete exact description/schema and 1200-character metadata cap conflict with the new upstream batch surface and remain release blockers if failing.
<!-- amox-release-summary:v0.1.9:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both high-level audits. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
