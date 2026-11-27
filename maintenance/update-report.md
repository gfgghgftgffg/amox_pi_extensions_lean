# Local upstream maintenance

Base: a6517d99b3d97dcd838be77b8bd2defc7a6d5dc4
Release after verified merge: @gfgghgftgffg/rpiv-todo-lean@0.1.16
Release after verified merge: @gfgghgftgffg/pi-goal-x-lean@0.1.4

<!-- amox-release-summary:@gfgghgftgffg/rpiv-todo-lean@0.1.16:start -->
- Todo: Set `maxWidgetLines: 0` to hide the panel on the next repaint while keeping `todo` and `/todos` available. In Pi’s fullscreen TUI, click the heading to collapse or expand it even when the keyboard shortcut is disabled.
- Todo: Child sessions no longer hide completed rows in the foreground panel. The panel disappears when its last completed row is hidden, without deleting tasks from the session list.
- Goal: Update to upstream 0.35.2 while retaining all seven tools and parent-session ownership. The update does not change the delegation guard or the advice to use `/goal-tweak` instead of editing a goal file in place.
<!-- amox-release-summary:@gfgghgftgffg/rpiv-todo-lean@0.1.16:end -->

<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.4:start -->
- Todo: Set `maxWidgetLines: 0` to hide the panel on the next repaint while keeping `todo` and `/todos` available. In Pi’s fullscreen TUI, click the heading to collapse or expand it even when the keyboard shortcut is disabled.
- Todo: Child sessions no longer hide completed rows in the foreground panel. The panel disappears when its last completed row is hidden, without deleting tasks from the session list.
- Goal: Update to upstream 0.35.2 while retaining all seven tools and parent-session ownership. The update does not change the delegation guard or the advice to use `/goal-tweak` instead of editing a goal file in place.
<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.4:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
