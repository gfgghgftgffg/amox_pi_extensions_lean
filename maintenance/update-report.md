# Local upstream maintenance

Base: 13ae5c834e54b2eb4446b3f681ee000c1fd67de7
Release after verified merge: v0.1.16

<!-- amox-release-summary:v0.1.16:start -->
- Update web access to upstream 0.47.0: Sofya and Outcrawl are discoverable through help and usable through JSON input, retaining the compact single-tool schema.
- Carry upstream opt-in proxy locking, larger GitHub README retrieval and platform temp-directory defaults; document configured-proxy usage and cover rejected overrides with offline facade regressions.
- Update subagents to upstream 0.23.1 using npm-provided dist: recover finished results by saved ID/handle after reload and reopen persisted agents with upstream worktree safeguards.
- Document Explore's inherited session model and conversation/reopen behavior changes in English and Chinese; add real-dist saved-result and refusal regressions without launching model tasks.
- Refresh source review, maintenance records, contracts and independently measured character proxies; preserve baseline assertions and leave todo outside the release selection.
<!-- amox-release-summary:v0.1.16:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
