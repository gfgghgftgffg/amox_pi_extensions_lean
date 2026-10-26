# Source review

## Exact sources and scope

This is a lean-only review. The exact supplied snapshots in sources.json are:

| Lean author repository | Before | After |
| --- | --- | --- |
| pi-web-access-lean | e5e9954a3ec000132d794b2ad88314c71e51a82e | 6842095b34a3650163bfbbfd9da225ac3ac33e3d |
| rpiv-todo-lean | f1e3fc7bcde2644a89803fa6a3a256fb7422d89f | 664409f1e91e7eb8375cb0e473321a7075f20de1 |

Read both complete entrypoints, package.json files, English/Chinese READMEs and facade/wrapper tests; compare the todo RPC tests and read the current local adapters, package usage and all three MAINTENANCE files. The supplied inventory contains no engine before/after or CHANGELOG. Do not infer engine changes from newer remote heads. Published engine pins remain pi-web-access 0.44.0 (d0e323ac935e8753d11e1853b81c057e39dee4dc), todo/i18n 2.15.0 (ce6d3530410812ca504ec294995581a52170f9e1), and subagents 0.22.0 (85a704cb8f35c96c0cabfa665b572bab296942e5). Subagents lean HEAD remains b084c51a7ec3fa6737b108ca3583e3d71075874f; no subagents snapshot is supplied or claimed reviewed anew.

## Item-by-item reuse decisions

- Web entrypoints are identical. Author metadata updates wrapper 0.42.2 to 0.44.0 and engine 0.42.0 to 0.44.0, already consumed here. Peer/dev ranges are unchanged. README changes are version/benchmark updates measured under Pi 1.4 instead of 1.3. Keep this repository's fixed versions, Pi baseline and independently captured character proxies; do not import author lockfiles or benchmark claims. The author's package description still has the old percentage.
- Web tests rename the real-help test to 0.44 and add Linkup. Existing local 0.43 regressions already cover Linkup help/JSON/execution, with 0.44 gateway coverage retained. No repeated upstream tests or baseline assertion edits are needed.
- Existing author op inference, object-input conversion and top-level argument merging are unchanged and remain outside this minimal compatibility scope. Existing broad hint rewriting also remains unadopted: it transforms every rendered text block and can alter literal page examples. Local results remain delegated intact, distinguishing rendered content from structuredContent and stored page bodies. Bilingual usage now explicitly states the current op/string-input contract.
- Todo's sole entrypoint change adds `or a tasks[] batch` to the guideline. Local description already says `create subject or tasks[]`; the complete nested batch schema, upstream normalization and atomic execution are already supported and tested. No duplicate resident guideline text is needed. Bilingual usage retains batch constraints and now states the existing one-in-progress/prompt-completion guidance.
- Todo metadata updates wrapper 2.13.12 to 2.15.0 and todo/i18n 2.13.9 to 2.15.0, already pinned here. Peers/dev are unchanged. README benchmark/runtime references change, but its Versions wrapper text and Chinese dependency text retain old values; the package description also retains old measurements. Keep locally managed versions/docs and recapture proxies instead of copying these claims.
- Todo wrapper tests add the tasks field and relax metadata length from 1200 to 1500. Local tests already cover the full schema and real batches, and the existing 1200 ceiling remains protected. RPC tests are identical. No tests are copied or weakened.
- Todo's previously unadopted bare-id inference, stronger step-by-step workflow text and RPC host-plan expansion are unchanged. The host-plan path still reads ctx.mode/sid after awaiting execution without stale protection. Keep local stale guards, asynchronous command ordering, session isolation, schema cloning/compaction and original result delegation.

No tools, fields, required values, invocation defaults or local execution behavior change in this review. No adapter edit or new regression is warranted. Existing maintenance records for engine internals remain supported by the fixed pins and real-runtime integration checks, not by a claimed review of unavailable engine sources. No implementation is copied and node_modules is untouched.

## Verification and release boundary

The check tool captures contracts and updates measured bilingual documentation using ceil(characters / 4), then runs typechecks, existing tests, contract verification, three fresh standalone production installs and both dependency audits in the credential-free Linux sandbox. Results are established by actual check output. Upstream advisories are retained as warnings under the owner's policy; audit execution/report failures still fail. All baseline assertions and metadata ceilings remain intact. No unrelated engine tests, SDK changes, overrides or publication/check infrastructure edits are introduced.

Live providers, paid models, interactive UI and Pi 1.4 are not claimed tested. No maintenance subagent or model task is launched. Exact-commit three-platform PR CI and all-platforms-pass, unchanged PR/head/base/main preflight, host-controlled merge and independent merged-commit Release validation remain the fixed downstream gates; this session does not publish or modify release permissions.
