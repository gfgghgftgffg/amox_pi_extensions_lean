# Local upstream maintenance

Base: 0301e72c75acfecc434afe8e7774950575f7b7e3
Release after verified merge: v0.1.40

<!-- amox-release-summary:v0.1.40:start -->
- `pi-subagents-lean` explains how to request an inline result with `run_in_background: false`. For background work, follow the completion notification or pass `{"wait":true}` in the `result` operation’s JSON `input` when the next step depends on the result. Both usage paths are documented in English and Chinese.
- `pi-web-access-lean` documents explicit operation selection and shows how to continue a stored result with `get` when the engine refers to `get_search_content`. The lean author’s new engine pin matches the release already used by this package.
<!-- amox-release-summary:v0.1.40:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
