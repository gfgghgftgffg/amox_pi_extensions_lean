# Local upstream maintenance

Base: ee2ff9e821eab1a37d95adecb56c04f152fb9c78
Release after verified merge: v0.1.15

<!-- amox-release-summary:v0.1.15:start -->
- pi-web-access-lean: reviewed author 6842095 → 189484d. The author's local-PDF Markdown/content-length repair is already present here, including compatible optional page metadata; retain the existing adapter and all PDF assertions. Clarify English/Chinese documentation that returned text contains saved Markdown and its path while counters are result metadata.
- pi-subagents-lean: reviewed author b084c51 → addf9e2. Entrypoint and tests are unchanged; the author's engine pin now matches this repository. Keep the npm-provided dist runtime and existing source/dist consistency checks, and clarify JSON object string input in both READMEs.
- Record exact source comparisons and reuse decisions in both package MAINTENANCE files and maintenance/agent-review.md. Preserve explicit operation schemas, unchanged runtime behavior and baseline tests; refresh independently measured character proxies and validate only the fixed release selection. Todo remains outside this release.
<!-- amox-release-summary:v0.1.15:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both dependency audits. Upstream advisory findings are recorded as warnings, not release blockers. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
