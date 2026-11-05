# Local upstream maintenance

Base: 13ae5c834e54b2eb4446b3f681ee000c1fd67de7
Release after verified merge: v0.1.16

<!-- amox-release-summary:v0.1.16:start -->
- Update web access to upstream 0.47.0: expose Sofya and Outcrawl through on-demand provider help and JSON input, retaining one compact web_access tool.
- Carry upstream optional proxy locking, GitHub README retrieval up to 100K characters and platform temp-directory defaults; add offline facade coverage for provider requests/filtering and proxy override rejection.
- Update subagents to upstream 0.23.1 via npm-provided dist: retrieve saved finished results by ID/handle/alias after reload and preserve upstream persisted-resume worktree safeguards.
- Preserve unknown-ID lookup for minimal programmatic result contexts with a narrow empty-history fallback after the actual baseline regression exposed the new sessionManager requirement; real host history remains unchanged.
- Document Explore's session-model default and conversation/reopen behavior in English and Chinese; validate saved results and resume refusal through real dist without model tasks.
- Refresh source review, maintenance records, contracts and measured character proxies; keep baseline assertions intact and todo outside the release selection.
<!-- amox-release-summary:v0.1.16:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
