# Local upstream maintenance

Base: 7e64c51cfc5c679e6201680400ed0bd9825d4417
Release after human merge: v0.1.4

<!-- amox-release-summary:v0.1.4:start -->
- Review all three lean-author revision pairs: web ae54d0d → c2beefc, todo 6c74831 → 50e485d, and subagents 777b853 → 3082c5f. Their complete adapters and package metadata are identical; the bilingual READMEs only change the stated benchmark host from Pi 1.2.0 to 1.3.0 while retaining the estimates.
- Update each package's bilingual README and MAINTENANCE with the current documentation-only review, exact source revisions, unchanged tool/parameter/default/behavior findings, and retained compatibility decisions. Replace the stale source-review report with evidence for this candidate.
- Preserve web argument normalization and literal result bodies, todo stale-context guards and command ordering, and subagents typebox validation and rendering delegation. Keep npm engine pins at web 0.41.0, todo/i18n 2.13.8 and subagents 0.22.0; unpublished engine HEADs are outside the supplied source review.
- Refresh this candidate's contracts and character-proxy measurements through check instead of importing the author's benchmark environment claims. No Pi 1.3 compatibility claim, adapter rewrite or unrelated upstream regression is introduced; baseline assertions remain intact.
- Validate the same candidate with actual typechecks/tests, contract checks, three fresh standalone production installs and both audits. Existing web network regressions use offline mocks before imports and distinguish rendered blocks from structured bodies. Human review and three-platform CI remain required before release.
<!-- amox-release-summary:v0.1.4:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both high-level audits. Three-platform CI and human review remain required; this report alone is not a cross-platform attestation.
