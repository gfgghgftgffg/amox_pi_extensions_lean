# Local upstream maintenance

Base: c2dc52dc1b91bc5e5c7d7f0da1f0d10b054f2da4
Release after verified merge: v0.1.7

<!-- amox-release-summary:v0.1.7:start -->
- Update pi-web-access to 0.43.0 while preserving the compact, single web_access facade and literal page content.
- Expose Linkup through existing advanced JSON and on-demand help; document API-key setup, explicit paid-provider selection and linkupDepth configuration.
- Carry upstream DeepSeek inline page storage and opt-in hosted Fetch support, configured-provider-array fallback and short static HTML fixes; document xAI gateway credentials and timeout configuration in both languages.
- Review all three exact lean-author before/after adapters. Retain current explicit operation/string-JSON contracts and todo guidance; record optional inference changes not reused and .ts imports already applied locally.
- Add focused offline facade regressions for Linkup requests/help, DeepSeek stored-content retrieval, default-array versus explicit-array fallback, and short-page/hosted fetching, preserving every baseline assertion.
- Refresh source-review and maintenance records; recapture contracts and character proxies and run the fixed sandbox validation gates.
<!-- amox-release-summary:v0.1.7:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both high-level audits. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
