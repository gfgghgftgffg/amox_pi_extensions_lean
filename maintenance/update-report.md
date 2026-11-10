# Local upstream maintenance

Base: ddc784a0e9c7d12a57b68cf8402231fc42b4c7ae
Release after verified merge: v0.1.26

<!-- amox-release-summary:v0.1.26:start -->
pi-subagents-lean now tracks @tintinweb/pi-subagents 0.23.2. The conversation viewer’s jump-to-start and jump-to-latest keys follow the host tui.altScreen bindings (Home/End remain aliases). No new tools or parameters; the single subagent facade is unchanged. Lean-author commits were reviewed and not copied: web-access was documentation-only on an already tracked 0.47.0 pin, and the subagents author still imports source rather than the published dist entry.
<!-- amox-release-summary:v0.1.26:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
