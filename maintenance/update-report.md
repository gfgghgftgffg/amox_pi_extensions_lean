# Local upstream maintenance

Base: e898a5d66eefe2d67bb0954cfbb5a2a2634c03b5
Release after verified merge: v0.1.13

<!-- amox-release-summary:v0.1.13:start -->
- Re-run the same pi-web-access 0.46.0 candidate after independent Ubuntu CI failed; the provided log tail contains no failing assertion, so this run seeks actionable local failure evidence without changing baseline tests or check infrastructure.
- Retain the PDF compatibility adaptation that returns Markdown with its saved path, derives character counts from content and preserves only reported page counts.
- Retain offline facade coverage for Cloudflare, SearchApi and Tabstack discovery/JSON execution and local/remote PDF text retrieval, including structured and stored content checks. Remote three-platform success is not claimed.
<!-- amox-release-summary:v0.1.13:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
