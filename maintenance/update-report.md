# Local upstream maintenance

Base: 5c73343fa1007ce4d2c98c102782bd55b6a523ed
Release after verified merge: v0.1.10

<!-- amox-release-summary:v0.1.10:start -->
- Review the exact web and todo lean-author updates against the current adapters: web source is unchanged, and todo's added batch hint is already covered by the local description, full tasks schema and atomic batch support.
- Clarify web usage in English and Chinese: pass an explicit op and string input, serializing advanced parameter objects as JSON. Preserve literal page text and the distinction between rendered hints, structured content and stored bodies.
- Clarify existing todo guidance in both languages: keep one task in_progress and mark it completed promptly, while retaining documented batch constraints and upstream normalization.
- Record package metadata, README and test reuse decisions in both maintenance records and the current source review. Retain existing adapter behavior, stale-context guards, session isolation and all baseline assertions, including the 1200-character todo metadata ceiling; do not import the author's relaxed budget or Pi 1.4 benchmarks.
- Recapture local contracts and character proxies and validate the unchanged runtime pins (web 0.44.0, todo/i18n 2.15.0, subagents 0.22.0) through typechecks, regressions, independent production installs and both dependency audits.
<!-- amox-release-summary:v0.1.10:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
