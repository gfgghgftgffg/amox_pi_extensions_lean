# Local upstream maintenance

Base: e5e754af8cb2a75efc54f24c4106ada886dcae4a
Release after verified merge: v0.1.36

<!-- amox-release-summary:v0.1.36:start -->
- Upgrade the web facade's pinned engine to pi-web-access 0.48.0; SpecStream, Autom and cloro are available through dynamic help and existing JSON delegation, retaining one compact web_access tool.
- Inherit optional SpecStream hosted fetching, broader readable-page recovery, network-timeout fallback, AnySearch domain filtering and revised DuckDuckGo pacing from upstream.
- Document upstream image/video-frame answer support with image-capable Pi models, text answers and original-source stored retrieval in both user READMEs.
- Add focused offline facade regressions for new providers, exact request shapes and filtered results, timeout routing, hosted fetch/get layers, image host streaming and text-only model refusal. Correct the new PNG fixture to a decodable image and prevent its hosted fallback from masking decoding failure; preserve all baseline assertions.
- Record exact source revisions, compatibility findings and unchanged adapter boundaries in MAINTENANCE.md and agent-review.md; recapture character proxies and run selected verification, fresh installs and both audits.
<!-- amox-release-summary:v0.1.36:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
