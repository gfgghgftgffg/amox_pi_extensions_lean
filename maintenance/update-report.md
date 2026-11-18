# Local upstream maintenance

Base: 89a0a79a36d9283b9c6373b2e160cbc995cdb8ec
Release after verified merge: v0.1.38

<!-- amox-release-summary:v0.1.38:start -->
- Update pi-subagents-lean to the pinned @tintinweb/pi-subagents 0.26.1 runtime: resuming a saved agent restores its recorded model and thinking level instead of silently selecting the parent's current settings; the SDK reports model fallback through a user warning.
- Inherit upstream mention-clone cwd deduplication and richer allowed-agent descriptions/tool scopes for nested delegation, including compact description mode, without expanding the lean tool schema or copying engine code.
- Clarify resume behavior in both user READMEs and record the exact publication-source review, unchanged parameters/defaults, response-layer boundaries and internal facade compatibility in MAINTENANCE.md and maintenance/agent-review.md.
- Retain the published dist entrypoints, one-tool facade and all baseline assertions. Recalculate character proxies and validate joint goal/subagents types/functions, child-context global v1, native dist result/notification ABI, source/dist parity, contracts, fresh production installs and both dependency audits. Only subagents is selected for release.
<!-- amox-release-summary:v0.1.38:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
