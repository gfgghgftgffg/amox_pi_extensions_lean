# Local upstream maintenance

Base: d2afbd3b33f843b2191b7fda825ef14db769c71e
Release after verified merge: v0.1.11

<!-- amox-release-summary:v0.1.11:start -->
- Upgrade the web runtime to pi-web-access 0.45.0, retaining the single compact web_access facade; preserve legacy provider normalization and list current allowed providers through on-demand help.
- Make search model selection, comma-separated providers, 9router and opt-in typed field extraction available through advanced JSON/help. Document Cloudflare page-text transfer, typed extraction errors versus stored page bodies, strict helper-model selection, routing budgets/fallback and gateway configuration in English and Chinese.
- Explicitly reject field-extract mode on the independent local PDF path so fields cannot be silently ignored. Preserve upstream source-check passage output and all original response objects.
- Add focused offline facade regressions with DNS/fetch mocks before imports, absolute URLs and fake credentials. Correct the new invalid-model regression to assert the actual rejected promise observed in the first check; all baseline assertions remain intact. Refresh exact-source review, maintenance notes, contracts and character-proxy measurements; todo and subagents runtime pins remain unchanged.
<!-- amox-release-summary:v0.1.11:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
