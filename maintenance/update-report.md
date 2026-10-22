# Local upstream maintenance

Base: e1f21649da8e7bd475b0be16f425c02f9d4e379d
Release after verified merge: v0.1.8

<!-- amox-release-summary:v0.1.8:start -->
- Update pi-web-access runtime from 0.43.0 to 0.44.0, adding upstream provider gateway configuration while preserving the single direct web_access facade and its compact op/input schema.
- Document gateway prefixes, environment-over-config precedence (including PI_DEEPSEEK_BASE_URL and PI_OLLAMA_BASE_URL), HTTPS/loopback URL constraints, and credential removal across provider API redirects in both English and Chinese.
- Clarify that toolActivation=none requires deferred exposure upstream while the lean web_access facade remains directly available; Jina rejects standalone dot-path queries.
- Add four focused real-facade offline regressions for none/deferred compatibility, DeepSeek gateway/authorization redirects, SerpApi query credential removal and Jina rejection, preserving all existing assertions. Record exact before/after source review and refresh contract/character-proxy measurements through the fixed check flow.
- Todo/i18n remain on 2.13.9 and subagents on 0.22.0; no unpublished remote implementation or unchanged lean-author source is adopted. Live provider and gateway services are outside offline verification; three-platform CI and fixed-host merge/release gates follow independently.
<!-- amox-release-summary:v0.1.8:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both high-level audits. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
