# Local upstream maintenance

Base: d2afbd3b33f843b2191b7fda825ef14db769c71e
Release after verified merge: v0.1.11

<!-- amox-release-summary:v0.1.11:start -->
- Update pi-web-access to 0.45.0 while retaining one web_access tool and its compact op/input schema; preserve legacy provider-array normalization and restore provider discovery in on-demand help using upstream helpers.
- Expose per-call search model selection, comma-separated providers and 9router through advanced JSON/help; document strict model selection, routing budgets and weak-result fallback, DuckDuckGo backoff, helper model configuration, Azure search and gateway HTTP opt-in in both languages.
- Support upstream opt-in typed field extraction through fetch JSON/help, document Cloudflare credentials and page-text transfer, and distinguish rendered fields from structured extraction results and stored original pages. Explicitly reject this new mode on the independent local PDF path.
- Add focused offline facade regressions for new provider/model/help, extract validation and response layers, source-check passages and local PDF rejection; retain all baseline assertions. Refresh source review, maintenance notes, contracts and measured character proxies; todo/i18n and subagents engine versions remain unchanged.
<!-- amox-release-summary:v0.1.11:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
