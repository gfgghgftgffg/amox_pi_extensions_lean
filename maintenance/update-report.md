# Local upstream maintenance

Base: 8b3d005ca2765d7abc49b3b0e97eb4781934750f
Release after verified merge: v0.1.14

<!-- amox-release-summary:v0.1.14:start -->
- Update pi-subagents-lean to the staged @tintinweb/pi-subagents 0.22.1 runtime while preserving the single subagent tool and published dist/index.js entry.
- Inherit upstream fixes for fresh max_turns budgets and live turn counters on resumed agents, foreground resume cancellation, parent thinking-level inheritance, and duplicate skills/cwd sections in append-mode prompts.
- Preserve upstream cross-extension additions through the existing facade: RPC steering, per-message usage events for nested/workflow agents, shutdown disposal notification, and consistent steering events from viewer/fleet paths.
- Keep advanced parameters available through JSON input and current upstream help, including the clarified resume budget description; no model tools or parameter fields are added or removed.
- Update English and Chinese documentation links and record the exact before/after source review and compatibility findings; refresh contracts and character-proxy measurements and run existing assertions, source/dist parity, fresh production installation and both audits.
<!-- amox-release-summary:v0.1.14:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
