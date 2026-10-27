# Local release maintenance

Base: 96ab57ee46d30a17bd6382bbf9703ff75a62c4b8
Release after verified merge: v0.1.12

<!-- amox-release-summary:v0.1.12:start -->
- Reduce subagents startup overhead by loading the upstream npm package's existing dist/index.js instead of src/index.ts. Preserve the single subagent facade, tool schemas, parameter validation, workflow forwarding and render delegation. Lean entrypoints remain TypeScript; web/todo behavior and all upstream dependency pins are unchanged.
- Keep typecheck, scope/workflow/registry regressions, Task Router identity and contract capture aligned with the compiled runtime. Require the published dist entry in fresh production installs and compare upstream source/dist tool contracts in isolated real Pi sessions.
- Preserve the dist policy in daily maintenance: missing distribution files, stale contracts or runtime regressions block acceptance rather than silently falling back to source. The existing systemd schedule, permissions, exact-head three-platform CI and independent Release/npm OIDC pipeline remain unchanged.
<!-- amox-release-summary:v0.1.12:end -->

Source review: [agent-review.md](agent-review.md).

Local validation covers typechecks, regressions, contracts, independent production installs and both dependency audits. Upstream advisory findings remain warnings; audit execution errors remain blockers. Exact-head three-platform PR CI is required before merge, and Release independently verifies the merged SHA before publishing verified archives to npm.
