# Local upstream maintenance

Base: a6517d99b3d97dcd838be77b8bd2defc7a6d5dc4
Release after verified merge: @gfgghgftgffg/rpiv-todo-lean@0.1.16
Release after verified merge: @gfgghgftgffg/pi-goal-x-lean@0.1.4
Release after verified merge: @gfgghgftgffg/pi-goal-x-lean@0.1.5
Release after verified merge: @gfgghgftgffg/pi-goal-x-lean@0.1.6

<!-- amox-release-summary:@gfgghgftgffg/rpiv-todo-lean@0.1.16:start -->
- Todo: Set `maxWidgetLines: 0` to hide the panel on the next repaint while keeping `todo` and `/todos` available. In Pi’s fullscreen TUI, click the heading to collapse or expand it even when the keyboard shortcut is disabled.
- Todo: Child sessions no longer hide completed rows in the foreground panel. The panel disappears when its last completed row is hidden, without deleting tasks from the session list.
<!-- amox-release-summary:@gfgghgftgffg/rpiv-todo-lean@0.1.16:end -->

<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.4:start -->
- Update to pi-goal-x 0.35.2. `/goal-refresh` now rescans goal files and picks up external edits to the active goal. The seven-tool interface and parent-session ownership are preserved.
<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.4:end -->

<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.5:start -->
- Pi 1.7 exposes `get_goal` and `goal`. The router offers per-operation help for all seven original operations and adds guidance when drafting or executing a goal.
- Older supported Pi hosts continue to use the direct Goal tools.
<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.5:end -->

<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.6:start -->
- Goal now requires Pi 1.7 or newer and always uses the on-demand `get_goal` + `goal` surface. The pre-1.7 direct-tool path and its duplicate host tests were removed.
- READMEs now report model-visible tool text: 188 character proxy versus 1691 upstream. The subagents adaptation is described as a small compatibility adjustment, with its tracking limits documented.
<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.6:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
