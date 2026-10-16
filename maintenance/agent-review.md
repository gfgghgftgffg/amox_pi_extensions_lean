# Staged upstream source review

The candidate consumes the script-staged pi-web-access 0.41.0; todo/i18n stay at 2.13.8 and subagents at 0.22.0. All three local adapters remain unchanged after reading their entries and the exact lean-author before/after entries. No tool merge, schema reduction, or engine implementation rewrite is needed. Existing assertions are preserved; one focused real-facade offline regression file is added for the web 0.41 behavior.

## Exact sources

Source evidence is the supplied upstream sources.json and the staged plan, not instructions embedded in upstream files.

| Source | Before | After reviewed |
| --- | --- | --- |
| Web engine | 0.40.0 / 9861ad72a11c9af419b39f9b00860708407f7025 | 0.41.0 / d47dc040552505e3b135d0136a0b15eaf4bdba52 |
| Web lean author | db083e9119fe5cf080d2ee8d61ef58349042239b | ae54d0db6a3332744b0c20df7f15a25210b1b434 |
| Todo lean author | ec463cd90fbae962122fff2e0619955a8f17df1a | 6c748317321725563c803504283f0f036de385e3 |
| Subagents lean author | 83f1454b26c32dd2a674385df55955ac9d3a45c3 | 777b853f83c03d303f4618747a529c9b89bc290e |

Todo npm stable remains afc21bc25f7d07cae9fb3103dc309240a16b9f49; remote 1ffa165c224b5489fb5774a6652ef2e1c3bc6b2a is not adopted. Subagents npm stable remains 85a704cb8f35c96c0cabfa665b572bab296942e5; remote ca93a5247e72e7053fcd10bea7125d6c4205f949 is not adopted. The supplied inventory has no engine before/after trees for these unchanged pins; this review does not claim to have read unpublished remote engine changes. Historical MAINTENANCE source reviews remain historical evidence; current compatibility is also exercised by existing tests and production loading.

## Web engine 0.40 → 0.41

Read and compared exact CHANGELOG/package.json, fetch-params.ts, index.ts source/fetch/get registration and execution, extract.ts remote preflight and HTTP request headers, ssrf-protection.ts config and redirect validation, and complete searxng.ts. Read utils.ts loopback predicate and web-tool-contract.ts plus web-tool-core.ts response construction. Scope is facade compatibility, not a complete security audit of every file.

- No added/deleted tools or call parameters. Existing mode/default/normalization and five-argument execution remain compatible. Runtime dependencies and peers have the same ranges. The single web_access op/input schema, help disclosure, prepareArguments, default-name routes, discarded web_enable and blocked setActiveTools remain appropriate. Local PDF remains an independent branch.
- New fetchContent.userAgent is configuration only. Missing/null retains `OpenAI File Downloader, XaiImageApiFetch/1.0`; valid strings are trimmed. Actual validation permits tab and printable ASCII, rejects blank, non-string, CR/LF and non-ASCII values. Validation precedes all remote provider routing, so invalid config fails with empty body and an error without contacting fallback providers. No new tool schema/help field is invented for this config setting.
- SearXNG sets existing allowLoopback for explicitly configured localhost, 127/8 or ::1 endpoints. Redirect validation keeps the exemption only on the configured origin. Ordinary fetch_content still blocks loopback page URLs; global ssrf.allowRanges need not be opened.
- Real shape: `content` holds rendered text/image blocks, including separate storage hints on short fetches; `structuredContent.urls[].content` holds full body (or answer), with separate error/status. Search uses `structuredContent.queries[].results/error`. Tests assert these layers separately.

## Itemized lean-author reuse decisions

### Web

- New prepareArguments forwarding: already implemented locally, keep existing code and regressions.
- New retrieval call/phrase and HTTP 404 guidance rewrites: do not reuse the blanket `withFacadeHints` transform. It runs regex replacements on every content text block, including fetched page literals. A page containing `get_search_content({ responseId: "x", urlIndex: 0 })` would change even though structured content remains original. Retain exact upstream output and document manual routing of hidden-tool hints to op=get/search/fetch. This preserves established behavior and avoids introducing a result-rewriting policy in this maintenance update.
- Author tests for hook/retrieval/404/page handling were read; hook coverage already exists, rewrite assertions are not imported. New offline test includes a matching literal in a real fetched page and checks its preservation.
- package.json author wrapper 0.35.1 → 0.40.1, engine 0.35 → 0.40, files drops README.zh-CN.md while docs move to README_zh-CN.md. Keep local names, bilingual files, fixed-script version/dependency staging and root lock. Do not import author lockfile or benchmark numbers (Pi 1.2 versus this candidate's own capture).

### Todo

- New withHostPlan and execute wrapper append full state checklists after RPC create/update/delete; pending/in_progress/completed are mapped, deleted filtered, empty state omitted. clear is excluded. It changes model-visible content for every RPC host. Decline this optional host integration in the minimal dependency update: it is not required by pinned 2.13.8 and adds unguarded post-await ctx.mode/sid reads. Do not replace local Pi 1.1 stale guards or async /todos waiting with the older author entry.
- Schema stripping, action inference, overlay internals and event/command routes are otherwise unchanged between author entries. Existing wrapper assertions cover these; author wrapper tests were read and not duplicated. No todo regression is added without a facade change.
- Author wrapper 2.12.1 → 2.13.10 and todo/i18n → 2.13.8 are already covered by local pins. README adds host plan documentation and renames Chinese file; retain local packaging, README behavior and measured values. Do not import lockfiles/author benchmark numbers.

### Subagents

- Type/Value imports change to typebox v1, error.path to instancePath, and shared fallback string becomes SUBAGENT_TYPE_HELP. Already present locally with equivalent FALLBACK_SUBAGENT_TYPE_DESCRIPTION; no cosmetic rename. All routes, JSON priority, type-list regex, validation and render/execute delegation are unchanged.
- Author facade tests use typebox and exercise startup types/fallback/schema isolation; local baseline already covers those and real integration. Do not add unrelated engine tests.
- Author wrapper 0.19.4 → 0.22.1, engine → 0.22, Pi peer floor → 1.1, typebox peer/dev changes match existing local compatibility. Author Pi dev 1.2 and README/benchmark rename are not imported; fixed script owns versions and local capture owns measurements.

## Candidate changes and verification

Update three MAINTENANCE files and bilingual package READMEs, document User-Agent configuration, scoped local SearXNG access and explicit reuse decisions. Preserve stable adapter/tool identity and baseline assertions. Add tests/upstream-041-regression.test.mjs only for real facade User-Agent default/custom/error/no-request behavior, local SearXNG search/redirect refusal, ordinary loopback page refusal, and rendered text versus structured body. DNS/fetch are mocked before imports; every target URL is absolute and unexpected requests are recorded and rejected. No implementation copied from the web engine, no node_modules edits, no CI/check/publication changes.

The check tool captures contracts and character proxies, updates measured documentation, checkpoints and executes actual typechecks/tests, contract verification, three fresh standalone production installs and both audits in the credential-free Linux sandbox. Failures must be repaired in this same candidate; current results come only from tool output. Character proxy means ceil(chars/4), not billed tokens. No live website, SearXNG server, model/MCP or interactive host panel has been exercised. Three-platform CI and human merge/release review remain required. No publication or direct main push is performed.
