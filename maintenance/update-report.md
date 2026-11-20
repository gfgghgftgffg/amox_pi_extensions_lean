# Local upstream maintenance

Base: b3b2e2cb1cc3ed78b71a1f084ba7af86ae49fe69
Release after verified merge: v0.1.39

<!-- amox-release-summary:v0.1.39:start -->
### pi-subagents-lean
- Update the pinned `@tintinweb/pi-subagents` runtime to 0.26.2 while retaining the single compact `subagent` facade and published `dist` runtime.
- Support upstream's subagent prompt-cache retention setting and per-agent `cache_retention` override; the default remains `inherit`, with no change to the parent session's cache policy.
- Pick up expanded nested/workflow lifecycle events, richer agent/workflow RPC observation, and RPC stop settlement waiting without changing the facade's tool schema or the goal integration ABI.
- Document the current cache and integration behavior in English and Simplified Chinese; record exact upstream and lean-author reuse reviews. No web, todo, goal, or sync release is included.
<!-- amox-release-summary:v0.1.39:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
