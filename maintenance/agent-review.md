# Source review

## Scope and exact sources

This is a lean-author-only review for the fixed release selection pi-web-access-lean and pi-subagents-lean. sources.json supplies web author `6842095b34a3650163bfbbfd9da225ac3ac33e3d` → `189484d37c0c346382597555b757480ec95b9397` and subagents author `b084c51a7ec3fa6737b108ca3583e3d71075874f` → `addf9e2e5a6c8f08719a4df48b10290b9214d902`. No engine snapshots or changelogs are supplied for this candidate. Engine pins remain pi-web-access 0.46.0 (`4af1a7f7757d450ba0afefe2d98737384dc9a9b4`) and pi-subagents 0.22.1 (`fc089c4b7ab0f1185453b2e53027997c1f637e38`). Newer engine remote heads are outside the review. Todo has no author or engine release change and its publication files are untouched.

Read both affected MAINTENANCE files first; compared complete before/after author entrypoints, package metadata, English/Chinese READMEs, facade tests, type declarations and TypeScript configuration. Read both complete local entrypoints and the existing web 0.46 regression. This is a facade compatibility/reuse review, not an exhaustive engine or dependency audit. Author lockfiles are not adopted; dependency locking and wrapper versions belong to the fixed host process.

## Web reuse decisions

The only author entrypoint change replaces obsolete local-PDF pages/chars reads with the extracted Markdown content and content.length, returning the saved-path notice followed by that Markdown. The author PDF declaration likewise replaces pages/chars with content. This repository already implemented that behavior during its engine 0.46 update. Its existing header-only page metadata recovery preserves older consumers and baseline page-count assertions while omitting unknown pages. Keep the local adapter and protected type declarations unchanged.

Author tests update search help from provider-name checks to the current string provider/comma-list and model fields, replace details.pages with page-text and positive character-count assertions, and update a PDF assertion in the pre-existing inference test. Local 0.45/0.46 coverage already exercises help, new providers, full Markdown/saved-file equality, exact character counts, known/unknown pages and a misleading Pages line in the body. Preserve all existing assertions; do not import duplicate tests or remove compatibility checks.

Author metadata updates wrapper/engine pins from 0.44 to 0.46 and benchmark description; peer/dev ranges and TypeScript config stay unchanged. Both READMEs refresh version/benchmark figures, but the English feature description still mentions page/character counts without distinguishing output text and metadata. Clarify the existing local bilingual PDF feature sentence: returned text contains the saved Markdown and path, while metadata carries character and available page counts. Use check measurements, not the author's Pi 1.4 benchmark.

No tools, call fields or defaults are added/removed by this author change. Retain explicit op/string input, default-name routing, upstream prepareArguments delegation, legacy provider-array normalization, on-demand provider discovery, web_enable suppression and setActiveTools interception. Existing author inference/object-input/top-level merging and global rendered-text hint rewriting are unchanged in these snapshots and remain unadopted under the prior documented decisions. The facade returns remote tool objects unchanged: rendered content, structured content and stored page bodies are separate layers, not interchangeable assertions.

## Subagents reuse decisions

The author entrypoint, facade tests, type stub and tsconfig are identical before/after. Metadata changes wrapper 0.22.4 → 0.22.5, engine 0.22.0 → 0.22.1 and benchmark description. Both READMEs update versions, measurements and the stated Pi measurement environment from 1.3 to 1.4. No new tool, parameter, default or behavior requires adaptation. Retain local versions/host dependencies and independently measured character proxies. Clarify the existing bilingual advanced-input feature sentence to say JSON object string, consistent with the local implementation and usage.

The author's unchanged source import is not reused: production continues loading npm-provided @tintinweb/pi-subagents/dist/index.js. Keep typebox v1 validation/instancePath, startup type-list parsing, direct-field precedence, captured withUsageReporting execution, five-argument calls, workflow availability and upstream rendering. Prior optional inference/object-input decisions remain recorded in MAINTENANCE; no new acceptance surface is introduced. Missing dist, source/dist contract divergence or real-dist regressions must block; no source fallback or local compilation is permitted.

## Candidate validation

Both adapters remain unchanged; no new tests are necessary for already-covered or metadata-only changes. Preserve baseline assertions and existing offline network regressions, which mock DNS/fetch before imports and use absolute URLs. No unrelated upstream tests, infrastructure edits, node_modules edits or private-agent tasks are introduced.

The check tool refreshes contracts and English/Chinese character-proxy tables and runs actual selected typechecks/tests, contract validation, fresh independent production installs and both dependency audits. ceil(characters/4) is a comparison proxy, not billing tokens. Actual results are authoritative; vulnerability advisories are warning-only under owner policy, while audit execution failure must remain visible. Live providers, PDF services, model tasks and interactive UI are outside this validation. Exact-head three-platform PR CI, merge preconditions and independent Release validation remain the fixed host workflow's responsibility.
