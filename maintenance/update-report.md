# Local upstream maintenance

Base: 700a341dfeefe6233116be56de2687646ec060bf
Release after verified merge: v0.1.5

<!-- amox-release-summary:v0.1.5:start -->
- Publish the reviewed npm distribution and automatic-merge fixes as 0.1.5; keep every facade entrypoint and upstream/SDK pin unchanged.
- Prefer unpinned public npm installation and pi update --extensions in both README languages; retain the Git fallback and one-source migration guidance.
- Ship shorter current-usage READMEs with review history kept in MAINTENANCE, and preserve strict archive identity/hash checks with bounded read-only registry propagation waits.
<!-- amox-release-summary:v0.1.5:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both high-level audits. Three-platform CI and fixed-host merge acceptance remain required; this report alone is not a cross-platform attestation.
