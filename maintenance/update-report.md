# Local upstream maintenance

Base: 7ffc2199477c2cc00e250b6043aab2f079415715
Release after verified merge: v0.1.6

<!-- amox-release-summary:v0.1.6:start -->
- Update pi-web-access to 0.42.0: DeepSeek is available through search/check help and advanced JSON with explicit paid-provider selection, domain/date filters and the upstream 128-character query limit.
- Preserve the directly available single web_access facade under upstream deferred exposure; document the eager/deferred configuration conflict and the host streaming path for virtual-model page answers and search summaries, Windows Bash credential sources and GCE ADC support in both README languages.
- Update rpiv-todo and coupled rpiv-i18n to 2.13.9; point four adapter deep imports directly at published .ts files while preserving task schemas, persistence, RPC session isolation and stale-context handling. Keep subagents on published 0.22.0.
- Add focused offline facade coverage for DeepSeek help/JSON execution and length errors, stable deferred registration, and answer-mode streamSimple forwarding with distinct rendered and structured response assertions. Preserve all baseline assertions and record exact source/reuse decisions; recapture local character-proxy measurements and contracts.
<!-- amox-release-summary:v0.1.6:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both high-level audits. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
