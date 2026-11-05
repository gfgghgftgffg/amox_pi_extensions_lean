# Local upstream maintenance

Base: 13ae5c834e54b2eb4446b3f681ee000c1fd67de7
Release after verified merge: v0.1.16

<!-- amox-release-summary:v0.1.16:start -->
- Update web access to upstream 0.47.0: discover Sofya and Outcrawl in on-demand help and select them through JSON input without expanding the single-tool schema.
- Carry optional upstream proxy locking and GitHub README/temp-directory fixes; verify provider requests, domain filtering and rejected proxy overrides through offline DNS/fetch facade regressions.
- Update subagents to upstream 0.23.1 using npm-published dist, including saved-result lookup by ID/handle/alias after reload and upstream persisted-session resume safeguards.
- Preserve unknown-ID result lookup for minimal contexts without a session manager using a narrowly scoped empty branch; retain real host contexts and existing assertions. Correct the fallback's explicit partial-context type boundary following actual typecheck feedback.
- Update bilingual guidance for Explore inheriting the session model and upstream conversation/worktree reopen behavior; cover saved retrieval and refusal through real dist without spawning tasks.
- Refresh detailed source reviews, maintenance records, contracts and measured character proxies; publish only the selected web and subagents packages.
<!-- amox-release-summary:v0.1.16:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
