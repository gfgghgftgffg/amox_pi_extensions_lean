# Local upstream maintenance

Base: a6517d99b3d97dcd838be77b8bd2defc7a6d5dc4
Release after verified merge: @gfgghgftgffg/rpiv-todo-lean@0.1.16
Release after verified merge: @gfgghgftgffg/pi-goal-x-lean@0.1.4
Release after verified merge: @gfgghgftgffg/pi-goal-x-lean@0.1.5
Release after verified merge: @gfgghgftgffg/pi-goal-x-lean@0.1.6
Release after verified merge: @gfgghgftgffg/rpiv-todo-lean@0.1.17
Release after verified merge: @gfgghgftgffg/pi-goal-x-lean@0.1.7
Release after human merge: @gfgghgftgffg/pi-web-access-lean@0.1.21
Release after human merge: @gfgghgftgffg/rpiv-todo-lean@0.1.18
Release after human merge: @gfgghgftgffg/pi-subagents-lean@0.1.27
Release after human merge: @gfgghgftgffg/pi-goal-x-lean@0.1.8
Release after human merge: @gfgghgftgffg/amox-pi-sync@0.1.16
Release after human merge: @gfgghgftgffg/amox-high-level@0.1.4

<!-- amox-release-summary:@gfgghgftgffg/rpiv-todo-lean@0.1.16:start -->
- **Panel visibility & mouse controls:** Set `maxWidgetLines: 0` to hide the Todo panel on the next repaint while keeping the `todo` tool and `/todos` command active. In Pi's fullscreen TUI, click the panel heading to collapse or expand it even when keyboard toggling is turned off.
- **Session-scoped completed rows:** Child sessions starting work no longer hide completed rows in the foreground panel, and hiding the final completed row removes the panel cleanly without deleting tasks from session state.
<!-- amox-release-summary:@gfgghgftgffg/rpiv-todo-lean@0.1.16:end -->

<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.4:start -->
- **Upstream `pi-goal-x` 0.35.2:** `/goal-refresh` now forces a full disk rescan of goal files to pick up external edits on the active goal, while preserving the seven-tool profile and parent-session ownership.
<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.4:end -->

<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.5:start -->
- **On-demand Goal router on Pi 1.7:** Exposes `get_goal` and `goal` on the first turn, providing per-operation `help` across all seven upstream operations plus stage-aware drafting and execution hints.
- **Legacy host compatibility:** Earlier supported Pi hosts continue using the direct Goal tool declarations.
<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.5:end -->

<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.6:start -->
- **Pi 1.7+ exclusive on-demand surface:** Requires Pi `>=1.7.0` and always installs the compact `get_goal` + `goal` surface, removing the legacy pre-1.7 direct-tool path and duplicate host test pass.
- **Model-visible footprint reporting:** Documentation now reports model-visible tool text (`188` character-proxy units vs. `1691` upstream) and clarifies subagent tracking boundaries. Publishes only `pi-goal-x-lean`.
<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.6:end -->

<!-- amox-release-summary:@gfgghgftgffg/rpiv-todo-lean@0.1.17:start -->
- **Workflow-aware panel hiding:** In Pi's terminal UI, the Todo panel automatically hides while Autoresearch mode is active or while the current session owns an active Goal (with `pi-goal-x-lean >=0.1.7`), and reappears once both workflows are paused or turned off.
<!-- amox-release-summary:@gfgghgftgffg/rpiv-todo-lean@0.1.17:end -->

<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.7:start -->
- **Active-Goal session signal for Todo:** Exposes whether the current terminal session owns an active Goal so `rpiv-todo-lean` can hide its panel automatically while leaving paused Goals and other sessions' Todo panels visible.
<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.7:end -->

<!-- amox-release-summary:@gfgghgftgffg/pi-web-access-lean@0.1.21:start -->
- **Documentation overhaul:** Standardizes README and maintenance documentation with package-scoped badges, clear feature summaries, explicit configuration and proxy boundaries, local versus remote PDF handling notes, and structured code examples.
<!-- amox-release-summary:@gfgghgftgffg/pi-web-access-lean@0.1.21:end -->

<!-- amox-release-summary:@gfgghgftgffg/rpiv-todo-lean@0.1.18:start -->
- **Documentation overhaul:** Updates README and maintenance docs with package metadata badges, structured task operation examples, explicit local versus npm installation instructions, and workflow-aware panel coordination notes.
<!-- amox-release-summary:@gfgghgftgffg/rpiv-todo-lean@0.1.18:end -->

<!-- amox-release-summary:@gfgghgftgffg/pi-subagents-lean@0.1.27:start -->
- **Documentation overhaul:** Refreshes README and maintenance guides with version badges, structured feature breakdowns, explicit guidance on settings files, prompt cache retention, nested concurrency caps, and child-session goal bridges.
<!-- amox-release-summary:@gfgghgftgffg/pi-subagents-lean@0.1.27:end -->

<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.8:start -->
- **Documentation overhaul:** Refreshes package README and maintenance notes with release badges, two-tool surface architecture explanations, stage-aware hint details, and subagent coordination boundaries.
<!-- amox-release-summary:@gfgghgftgffg/pi-goal-x-lean@0.1.8:end -->

<!-- amox-release-summary:@gfgghgftgffg/amox-pi-sync@0.1.16:start -->
- **Documentation overhaul:** Updates README and maintenance documentation with status badges, detailed feature overviews for deletion propagation and tree cleanup, explicit prerequisites, and clear configuration tables.
<!-- amox-release-summary:@gfgghgftgffg/amox-pi-sync@0.1.16:end -->

<!-- amox-release-summary:@gfgghgftgffg/amox-high-level@0.1.4:start -->
- **Documentation overhaul:** Updates package documentation with npm and Pi compatibility badges, bilingual README alignment, and structured maintenance specifications covering upstream review boundaries and verification commands.
<!-- amox-release-summary:@gfgghgftgffg/amox-high-level@0.1.4:end -->

Source review: [agent-review.md](agent-review.md).

The local verification gate runs workspace typechecks, functional tests, tool-contract checks, isolated production installs, and both full and production dependency audits (upstream advisory findings are recorded as warnings rather than release blockers). Exact-head three-platform CI and fixed-host merge verification remain required downstream gates.
