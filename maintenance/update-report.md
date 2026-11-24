# Local upstream maintenance

Base: d63335e4709997654c3924ea12ac07cf3e3c756c
Release after verified merge: v0.1.41

<!-- amox-release-summary:v0.1.41:start -->
- Update pi-subagents to 0.26.3 while retaining the lean facade, published dist execution and native notification/result integration.
- Follow pi-goal-x 0.34.2: keep seven tools with a fixed task-setting-dependent profile, remove obsolete goal_question metadata and the proposal sisyphus argument, and preserve upstream drafting, lifecycle and delegation behavior.
- Update pause/resume and user documentation for the current upstream contracts.
<!-- amox-release-summary:v0.1.41:end -->

Source review: [agent-review.md](agent-review.md).

Owner approved the goal 0.34.2 contract migration. This manually repaired candidate runs real tests, contracts, standalone production installs and both dependency audits. Publication still requires exact-head three-platform CI and release verification.
