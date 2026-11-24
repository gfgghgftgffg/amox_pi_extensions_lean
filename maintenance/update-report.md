# Local upstream maintenance

Base: 7044cb0813f1f22bdf77edc6535826f1f836e988
Release after verified merge: v0.1.42

<!-- amox-release-summary:v0.1.42:start -->
- Recover stale sync locks only after the recorded owner PID has exited; live and malformed locks remain protected.
- Add `/sync-unlock` for explicit stale-lock recovery in manual, auto and off modes, without force or age-only takeover.
- Preserve operation and lock-release errors, and show session-tree, snapshot-commit, local-deletion and config-save progress during `/delete-session`.
<!-- amox-release-summary:v0.1.42:end -->

Source review: [agent-review.md](agent-review.md).

This package-local fix runs real tests, contract checks, standalone production installation and both dependency audits. Publication requires exact-head three-platform CI and release verification.
