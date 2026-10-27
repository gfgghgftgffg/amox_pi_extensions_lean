# Source review

## Scope

Owner-requested startup optimization on base `96ab57ee46d30a17bd6382bbf9703ff75a62c4b8`, released as 0.1.12. No upstream version upgrade or newly adopted lean-author revision is included. Upstream pins remain subagents 0.22.0, web 0.45.0 and todo/i18n 2.15.0. Root, workspace, lockfile and manifest wrapper versions advance together.

## Runtime and compatibility

The subagents adapter now imports the upstream npm package's existing `dist/index.js` instead of `src/index.ts`. No upstream implementation is copied, modified or rebuilt. The facade's schema, explicit operation contract, JSON input validation, startup type parsing, execute/result/usage forwarding and rendering delegation are unchanged. All three lean entrypoints remain `index.ts`; web/todo retain their existing runtime imports.

Typecheck maps the compiled entry to the existing declaration stub. Scope, workflow and registry tests import the same dist modules as production, avoiding a separate source registry. Task Router identity checks use the compiled agent-runner. A new isolated real-host regression compares upstream source/dist tools, schemas, descriptions, activation and session initialization; source is loaded only for that comparison, never as a production fallback.

The manifest declares the mandatory subagents `upstreamEntry`. Contract capture and fresh standalone production installs use the same explicit entry resolver. Missing or non-file distribution entries fail closed, including when the upstream manifest still advertises a valid source entry. Regression fixtures cover missing entries, directories and unsafe paths. The tracked contract snapshot changes only the upstream subagents entry path and wrapper release versions, not tool contents.

Daily maintenance instructions require preserving the dist import rather than copying an author's source entry. Git TS remains the source-review input; fixed npm packages provide the actual distribution artifact. Local checks, three-platform CI and independent Release all execute the same production and regression checks. No systemd unit, permission, credential, schedule or publication infrastructure changes are needed; the service clones remote main for each candidate.

## Verification boundary

The adaptation passed local typechecks and 165 tests, unchanged tool contracts, fresh independent production installs and additional real Pi 1.4.0 source/dist and identity checks before the wrapper version bump. The final 0.1.12 candidate repeats the full local validation before push. Both dependency audits execute under the existing warning-only advisory policy; no dependency downgrade, override or SDK upgrade is introduced.

Startup experiments were performed on this Linux host and are not a cross-platform performance guarantee. Live paid models, external web providers, interactive keyboard behavior and every user configuration are not claimed exhaustively tested. Exact-head three-platform PR CI must pass before merge; Release must independently verify the immutable merged SHA and publish its validated archives through npm OIDC. npm registry availability and the personal installation are checked after publication.
