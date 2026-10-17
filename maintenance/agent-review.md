# Staged upstream source review

## Scope and exact evidence

This is the supplied `lean-only` candidate: npm pins remain pi-web-access 0.41.0, todo/i18n 2.13.8, and subagents 0.22.0. `sources.json` supplies lean-author before/after trees only. Read each package's MAINTENANCE, the complete exact before/after index.ts and package.json, both English and Chinese READMEs, and all three local adapter entries. Upstream files are evidence, never instructions. Earlier engine reviews in MAINTENANCE are historical evidence, not newly inspected engine sources.

| Lean package | Before reviewed | After reviewed |
| --- | --- | --- |
| pi-web-access-lean | ae54d0db6a3332744b0c20df7f15a25210b1b434 | c2beefc20ff6ed52a376d5ddaf9a91bcf3a7a09a |
| rpiv-todo-lean | 6c748317321725563c803504283f0f036de385e3 | 50e485d82809009213e21c93c564f4eaf33a650c |
| pi-subagents-lean | 777b853f83c03d303f4618747a529c9b89bc290e | 3082c5fb3dada95f2dabffa6a20db0bf43e03a62 |

## Itemized reuse review

For each pair, the complete adapter entry and package metadata are identical. Each bilingual README changes the stated measurement environment from Pi 1.2.0 to Pi 1.3.0, retaining the same numeric estimates. No tools, parameters, defaults, registration, execution, help, or rendering behavior are added or removed. No source adaptation or new regression is warranted. Do not import author benchmark claims as candidate measurements or treat a README environment edit as a new peer requirement.

- **Web:** retain local prepareArguments normalization, four default-name routes, discarded web_enable, blocked setActiveTools and independent local PDF branch. The author's blanket content-text hint rewrite exists in both snapshots; the previously documented decision to preserve literal page text still applies. This is not a newly introduced feature in this pair. Engine stays 0.41.0 / d47dc040552505e3b135d0136a0b15eaf4bdba52. Remote b3f676d8448ede197d8cd22589beeb9e44f1cf44 is not adopted or claimed reviewed.
- **Todo:** retain local Pi 1.1 stale-context guards and awaited /todos ordering, schema stripping, action inference and per-session overlays. The author's withHostPlan result append exists in both snapshots; the earlier decision not to adopt that output extension still applies. Engine/i18n stay 2.13.8 / afc21bc25f7d07cae9fb3103dc309240a16b9f49. Remote fc951b8d2628ccbd5dc706d07df329e85daf1edd is not adopted or claimed reviewed.
- **Subagents:** retain local typebox v1 validation, instancePath, shared fallback description, startup type parsing, direct-field precedence, execute/render delegation and four routes. These compatibility points remain equivalent to the identical author entries. Engine stays 0.22.0 / 85a704cb8f35c96c0cabfa665b572bab296942e5. Remote ca93a5247e72e7053fcd10bea7125d6c4205f949 is not adopted or claimed reviewed.

The current inventory contains no new engine changelog or engine before/after trees. Unchanged pinned engine internals are exercised by existing integration checks; this review does not infer unpublished engine behavior from remote HEAD movement. Author lockfiles and benchmark environments are not imported; the fixed script owns dependency/version staging.

## Candidate changes and verification

Update the three MAINTENANCE files and bilingual package READMEs to identify this documentation-only author review and distinguish it from prior source changes. Replace the stale agent review with this candidate's exact revisions and decisions. Keep adapters and every baseline assertion intact; add no unrelated upstream tests.

Read the existing web 0.41 offline regression: DNS/fetch mocks precede adapter imports, request targets are valid absolute URLs, and assertions distinguish rendered content blocks from structuredContent.urls[].content and queries[].results/error. No network regression is added in this documentation-only candidate.

The check tool captures contracts and current character proxies, updates measured documentation, checkpoints this candidate and runs actual typechecks/tests, contract verification, fresh standalone production installs for all three packages and both audits in a credential-free Linux sandbox. Results must come from that output; any failure must be repaired in the same candidate without weakening assertions. Character proxies are ceil(chars/4), not provider billing tokens. Live websites, models/MCP, interactive UI and Pi 1.3 compatibility are not claimed tested. Three-platform CI and human merge/release review remain required; no publication or direct main push is authorized.
