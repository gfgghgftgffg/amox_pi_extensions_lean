# Local upstream maintenance

Base: 8f570374a8be98a0e27ab8903f0997b4ffefc5f1
Release after human merge: v0.1.2

<!-- amox-release-summary:v0.1.2:start -->
- Update the pinned web engine from pi-web-access 0.39.0 to 0.40.0. Fetch help now exposes the optional redirects: "same-origin" setting through existing advanced JSON input; enabling it refuses cross-origin redirects before contacting the target, returns no page body on refusal, and disables extraction paths whose redirect chain cannot be observed. The compact web_access schema remains op/input.
- Inherit upstream fixes for Gemini video uploads through a configured gateway, answer mode on video transcripts with thumbnails, Unicode-safe stored-content pagination, and valid findText excerpt edges. Document the behavior and limitations without duplicating upstream implementation.
- Update the pinned subagent engine from 0.21.0 to npm stable 0.22.0. Document that smart/async completion delivery no longer waits for siblings, busy-parent completions combine at the tool-batch boundary, idle completions combine over about 200 ms, group joins use parent-turn batches, pending completions survive Esc, and reading a finished result cancels a notification before delivery.
- Document default-enabled installed-package agents/workflows, user-definition precedence, project-trust filtering, packageAgents/packageWorkflows allowlists, read-only package-agent management, and shutdown cleanup. Keep the subagent adapter and existing schema/usage/render delegation intact; rpiv-todo and rpiv-i18n remain pinned to 2.13.8.
- Add one focused offline real-facade regression for redirect help and JSON forwarding, same-origin success, cross-origin refusal with no target request, invalid values with no request, structured page bodies versus rendered tool text, and stable compact tool identity. DNS/fetch mocks are installed before imports and use absolute HTTPS URLs; all baseline assertions are preserved.
- Record exact release-source revisions and unchanged lean-author commits, refresh README/MAINTENANCE/source review and capture character proxies (ceil(chars/4), not billing tokens). Run actual candidate typechecks, regression tests, contract verification, three fresh production installs, and both audits. Live provider/video/gateway/MCP and interactive notification timing remain outside offline coverage; release awaits three-platform CI and human review.
<!-- amox-release-summary:v0.1.2:end -->

Source review: [agent-review.md](agent-review.md).

The local gate runs real tests, contracts, standalone production installs and both high-level audits. Three-platform CI and human review remain required; this report alone is not a cross-platform attestation.
