# Local upstream maintenance

Base: 2a363b8b071c93414dfc542da953737e7579715e
Release after verified merge: v0.1.43

<!-- amox-release-summary:v0.1.43:start -->
- Update the goal engine to pi-goal-x 0.35.1 without changing the seven goal tools, their argument schemas, or the parent-session waiting and completion guard. Existing commands and goal files remain usable.
- Task-list confirmation now keeps its key hints within the dialog width. If the host cannot show the custom audit-interruption dialog, the goal defaults to continuing work rather than bypassing the audit.
- Clarify in both goal READMEs that `/goal-tweak` is the reliable way to edit an existing objective: `/goal-refresh` can still serve the old objective after a direct file edit.
<!-- amox-release-summary:v0.1.43:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
