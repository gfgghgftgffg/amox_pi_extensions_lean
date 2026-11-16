# Local upstream maintenance

Base: e5e754af8cb2a75efc54f24c4106ada886dcae4a
Release after verified merge: v0.1.36

<!-- amox-release-summary:v0.1.36:start -->
- Update pi-web-access-lean to the pinned pi-web-access 0.48.0 runtime, exposing SpecStream, Autom and cloro through on-demand help and existing JSON input without expanding the single-tool schema.
- Inherit opt-in SpecStream hosted page fetching, more complete readable extraction, network-timeout routing fallback, AnySearch domain filtering and stricter DuckDuckGo pacing from upstream.
- Support image and video-frame questions through upstream answer mode with image-capable Pi models; document that answers are text and stored-result retrieval returns original source content.
- Add focused offline facade regressions for new provider requests/results, timeout fallback, hosted fetch/get response layers and image-answer capability boundaries; preserve existing adapter behavior and baseline assertions.
- Record exact before/after source evidence and compatibility decisions in package maintenance notes and the source review, synchronize English/Chinese usage docs, and recapture character-proxy measurements.
<!-- amox-release-summary:v0.1.36:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
