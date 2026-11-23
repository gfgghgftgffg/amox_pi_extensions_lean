# Local upstream maintenance

Base: 0301e72c75acfecc434afe8e7774950575f7b7e3
Release after verified merge: v0.1.40

<!-- amox-release-summary:v0.1.40:start -->
- `pi-subagents-lean` now explains how to request an inline result with `run_in_background: false`. For an agent already running in the background, the tool recommends relying on the completion notification and shows how to use `result` with `{"wait":true}` when the next step depends on the result. The bilingual usage guide covers both paths and the existing workflow opt-in remains in the tool instructions.
- `pi-web-access-lean` clarifies how to call `web_access` with an explicit operation and how to use the returned response ID with `get` when an upstream retrieval hint appears. The lean author's engine pin catches up to the version already used here.
<!-- amox-release-summary:v0.1.40:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
