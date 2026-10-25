# Local upstream maintenance

Base: eeda719e84344fa77f4c7833b121ed1c808a9bb7
Release after verified merge: v0.1.9

<!-- amox-release-summary:v0.1.9:start -->
- Update the todo and i18n runtimes from 2.13.9 to 2.15.0, adding atomic batch creation through tasks[] while retaining single-create calls and the six existing actions.
- Keep the upstream nested schema and argument-normalization hook; correct the compact create description and guideline to explain subject versus tasks[], per-item fields and dependency constraints.
- Inherit upstream error-card rendering fixes and malformed-snapshot rejection through existing render and RPC replay delegation, preserving session isolation and stale-context handling.
- Update bilingual usage documentation and exact-source maintenance review; add focused real-facade regressions for normalized batches, atomic failures, persistence, RPC replay and rendering.
- Validation must preserve protected baseline assertions. The existing exact old description/schema and 1200-character budget conflict with the upstream batch surface; report actual failures and block readiness rather than weakening assertions.
<!-- amox-release-summary:v0.1.9:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both high-level audits. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
