# Local upstream maintenance

Base: d63335e4709997654c3924ea12ac07cf3e3c756c
Release after verified merge: v0.1.41

<!-- amox-release-summary:v0.1.41:start -->
- Subagents: print and JSON sessions wait for background agents and workflows and can answer with their results before exiting. Set `headlessWaitMinutes` to request cancellation after a limit; the default is unlimited.
- Subagents: delegating agents wait for their background children; completed nested results remain available for the lifetime of the parent's record.
- Goal: unretryable provider errors or exhausted configured network retries pause the goal with a reason instead of leaving it active. Use `/goal-resume [text]` after fixing the issue to resume and optionally send instructions.
- Goal: failed context compaction saves buffered goal progress and warns without pausing the goal. Existing goal tool names and the subagent result-wait guard are preserved.
<!-- amox-release-summary:v0.1.41:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
