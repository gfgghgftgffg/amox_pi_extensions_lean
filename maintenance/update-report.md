# Local upstream maintenance

Base: e898a5d66eefe2d67bb0954cfbb5a2a2634c03b5
Release after verified merge: v0.1.13

<!-- amox-release-summary:v0.1.13:start -->
- Upgrade the web runtime to pi-web-access 0.46.0 while preserving the single compact web_access facade, advanced JSON forwarding and existing upstream pins for todo/i18n and subagents.
- Adapt local PDF handling to the upstream Markdown result: return the saved path and extracted text, derive character counts from content, and preserve page counts only when reported in the extractor's metadata header. Add offline coverage for local/remote PDF text and Cloudflare, SearchApi and Tabstack discovery and execution.
- Make the Linux maintenance sandbox independent of /usr/bin/node by read-only mounting the running Node executable at a fixed private path. Retain environment clearing, hidden host credentials and read-only candidate source; test execution with a Node binary outside /usr without exposing its parent toolchain directory.
<!-- amox-release-summary:v0.1.13:end -->

Source review: [agent-review.md](agent-review.md).

Local validation runs typechecks, regressions, contracts, standalone production installs and both dependency audits. Upstream advisories remain warnings; audit execution failures remain blockers. Exact-head three-platform CI must pass before merge, followed by independent Release verification of the merged SHA and npm OIDC publication.
