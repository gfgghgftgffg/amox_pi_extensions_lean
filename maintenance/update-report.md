# Local upstream maintenance

Base: 2a363b8b071c93414dfc542da953737e7579715e
Release after verified merge: v0.1.43
Release after human merge: @gfgghgftgffg/amox-high-level@0.1.2
Release after human merge: @gfgghgftgffg/amox-high-level@0.1.3

<!-- amox-release-summary:v0.1.43:start -->
- Update the goal engine to pi-goal-x 0.35.1 without changing the seven goal tools, their argument schemas, or the parent-session waiting and completion guard. Existing commands and goal files remain usable.
- Task-list confirmation now keeps its key hints within the dialog width. If the host cannot show the custom audit-interruption dialog, the goal defaults to continuing work rather than bypassing the audit.
- Clarify in both goal READMEs that `/goal-tweak` is the reliable way to edit an existing objective: `/goal-refresh` can still serve the old objective after a direct file edit.
<!-- amox-release-summary:v0.1.43:end -->

<!-- amox-release-summary:@gfgghgftgffg/amox-high-level@0.1.2:start -->
- Store the default summary prompt in `pi-high-level.json` and preserve existing custom prompts and settings when adding it.
- Read saved prompt edits on the next summary and let the settings menu write the built-in text back to the file.
<!-- amox-release-summary:@gfgghgftgffg/amox-high-level@0.1.2:end -->

<!-- amox-release-summary:@gfgghgftgffg/amox-high-level@0.1.3:start -->
- Fix Kimi K3.1 Pro summaries through Codex Responses by using the SDK’s default tool choice for requests without tools.
<!-- amox-release-summary:@gfgghgftgffg/amox-high-level@0.1.3:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
