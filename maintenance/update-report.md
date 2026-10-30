# Local upstream maintenance

Base: e898a5d66eefe2d67bb0954cfbb5a2a2634c03b5
Release after verified merge: v0.1.13

<!-- amox-release-summary:v0.1.13:start -->
- Update the web runtime to pi-web-access 0.46.0, making Cloudflare, SearchApi and Tabstack available through existing on-demand help and advanced JSON input while retaining the single web_access tool and compact op/input schema.
- Return readable Markdown for local PDFs alongside the saved path; adapt to the upstream PDF result shape, preserve known page counts from extractor metadata and calculate character counts from the returned Markdown. Unknown page counts remain omitted.
- Consume upstream remote PDF text retrieval and mixed-case MIME handling, plus opt-in Exa/Tabstack hosted fetch and curl transport improvements. Keep provider configuration and billing details linked to upstream documentation.
- Add offline facade regressions for all three new provider routes, local PDF content/metadata and remote PDF stored continuation, preserving every existing assertion. Synchronize English/Chinese PDF documentation, source review and measured character-proxy documentation.
- Todo/i18n and subagents runtime pins remain unchanged; subagents continues loading the npm package's dist/index.js. Live paid-provider and curl-impersonate behavior is outside the offline verification scope.
<!-- amox-release-summary:v0.1.13:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
