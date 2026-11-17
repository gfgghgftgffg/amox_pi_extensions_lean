# Local upstream maintenance

Base: e4892a45ae5148565ac79b4b4258f050e4a7cae9
Release after verified merge: v0.1.37

<!-- amox-release-summary:v0.1.37:start -->
- Update pi-subagents-lean to the staged @tintinweb/pi-subagents 0.26.0 runtime, preserving its published dist entrypoints and the goal/subagents joint compatibility gate.
- Align the compact workflow guideline with upstream explicit workflow opt-in: requests for a number of agents use parallel run calls; requested or named workflows use workflow.
- Preserve on-demand workflow authoring help across inline, skill and deferred settings, and document that the single lean facade does not defer an individual operation. Verify the bundled skill is reachable through its actual published path.
- Carry upstream strict draft-07 workflow schema validation, failure diagnostics and live workflow progress/accounting improvements through the pinned engine; distinguish notification failure text from structured tool content.
- Update both user READMEs and detailed exact-source review records; add focused real-dist facade exposure/help and authoring-error regressions while preserving all baseline assertions. Recalculate character proxies and run joint tests, contracts, fresh production installs and both dependency audits.
<!-- amox-release-summary:v0.1.37:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
