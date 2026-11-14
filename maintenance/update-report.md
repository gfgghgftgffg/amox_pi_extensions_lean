# Local upstream maintenance

Base: 3b2ea8376b4ed86f30997159d9f88e57f1fc2018
Release after verified merge: v0.1.35

<!-- amox-release-summary:v0.1.35:start -->
- Update pi-subagents-lean to upstream @tintinweb/pi-subagents 0.25.0, retaining the published dist runtime and the single subagent facade.
- Built-in general-purpose agents can now delegate outside workflows within the existing depth and nested concurrency limits; existing custom overrides remain opt-in. Document this behavior in both user READMEs.
- Settings now saves to the global file unless the project already has subagents.json, supports Tab to switch targets, and merges changed keys; upstream also adds source tags, reset/filter controls and validated numeric editing.
- Saved result text now includes the finish timestamp and age when available. Upstream also fixes finished nested-child retention on session switch and schedule lock stalls.
- Record exact before/after source evidence and unchanged tool/parameter/default and child-context contracts in MAINTENANCE.md and agent-review.md. No facade source adjustment or unrelated upstream test is needed; preserve existing assertions and jointly validate goal/subagents compatibility, source/dist contracts, production installations and both dependency audits.
<!-- amox-release-summary:v0.1.35:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
