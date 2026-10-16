# Local upstream maintenance

Base: 35b6f1b5766f95883c26dd32eab12395f71d0212
Release after human merge: v0.1.3

<!-- amox-release-summary:v0.1.3:start -->
- Upgrade the pinned web engine from pi-web-access 0.40.0 to 0.41.0. Document fetchContent.userAgent configuration, its unchanged default, trimming and validation, and failure before any remote provider request when configuration is invalid. Keep configuration out of the compact op/input tool schema.
- Inherit scoped access to explicitly configured loopback SearXNG endpoints without globally opening ssrf.allowRanges. Verify through the real facade that search succeeds, redirects to another local origin are refused before contact, and ordinary loopback page fetches remain blocked.
- Review exact before/after lean-author entries for all three packages. Retain the already-present prepareArguments and typebox v1/instancePath compatibility fixes. Do not import blanket web result-text rewrites that can alter literal page examples, or host-specific todo RPC plan snapshots with new unguarded post-execution context reads. Document manual facade routing of upstream retrieval hints and preserve existing adapters, stale-context protections and result envelopes.
- Add focused offline web 0.41 facade regressions for default/custom/invalid User-Agent behavior, zero requests on invalid configuration, scoped local SearXNG behavior, literal page content, and rendered tool text versus structured content. Install DNS/fetch mocks before upstream imports and use absolute URLs; preserve every baseline assertion and avoid unrelated upstream tests.
- Keep todo/i18n at npm stable 2.13.8 and subagents at 0.22.0, excluding unpublished remote HEADs. Update bilingual package READMEs, maintenance notes and the itemized source review with exact revisions, reuse decisions and validation limits; capture current character proxies as ceil(chars/4), not billing tokens.
- Run actual candidate typechecks, regression tests, contract verification, three fresh production installs and both audits in the credential-free Linux sandbox. Live websites/SearXNG services, models/MCP and interactive host integrations remain outside offline coverage; three-platform CI and human merge/release review are still required.
<!-- amox-release-summary:v0.1.3:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both high-level audits. Three-platform CI and human review remain required; this report alone is not a cross-platform attestation.
