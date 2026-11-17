# Local upstream maintenance

Base: e4892a45ae5148565ac79b4b4258f050e4a7cae9
Release after verified merge: v0.1.37

<!-- amox-release-summary:v0.1.37:start -->
- Update pi-subagents-lean to @tintinweb/pi-subagents 0.26.0, retaining published dist entrypoints and mandatory joint goal/subagents validation without publishing the unchanged goal package.
- Require an explicit workflow request in the compact guideline, matching upstream workflow opt-in; requests for several agents use parallel run calls.
- Preserve on-demand workflow authoring reference delivery for inline, skill and deferred settings. Document that the single facade keeps its workflow operation available and verify the actual published skill path.
- Inherit strict draft-07 schema validation, workflow failure reasons, live progress and corrected retry/resume accounting from the pinned upstream runtime; document notification text versus tool response structure.
- Refresh bilingual README and exact-source maintenance review, character proxies and focused real-dist regression coverage. Correct the new early-validation regression to accept the observed absence of details while still asserting no task ID or structuredContent; baseline assertions remain intact. Run joint type/function/ABI/contract checks, fresh production installs and both dependency audits on this same candidate.
<!-- amox-release-summary:v0.1.37:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
