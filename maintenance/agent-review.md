# Staged upstream source review

## Exact sources and scope

Read all three package MAINTENANCE files before reviewing the supplied sources as data. The authoritative snapshots are in sources.json:

- Web engine: 0.42.0 `18e36f9e0fc2de3c9895a7fda8d39a62ce60f49e` → 0.43.0 `7fcb1531fbc4b86cef12e8851f66b42e6385e0ce`. Remote `d0e323ac935e8753d11e1853b81c057e39dee4dc` is newer and is not adopted.
- Web lean: `09262708ad57726d1a4b3c22b084fb84ea22281b` → `e5e9954a3ec000132d794b2ad88314c71e51a82e`.
- Todo lean: `50e485d82809009213e21c93c564f4eaf33a650c` → `f1e3fc7bcde2644a89803fa6a3a256fb7422d89f`. Todo/i18n stable remain 2.13.9 at `54df50eea935fc9753edc300d5f23c5e28d906d7`; remote `d3c6f0812140605a4e55e0a660eb83edc12abbc5` is not adopted.
- Subagents lean: `3082c5fb3dada95f2dabffa6a20db0bf43e03a62` → `b084c51a7ec3fa6737b108ca3583e3d71075874f`. Engine stable remains 0.22.0 at `85a704cb8f35c96c0cabfa665b572bab296942e5`; remote `ca93a5247e72e7053fcd10bea7125d6c4205f949` is not adopted.

Review covers facade compatibility, not a full upstream security audit. No todo/subagents engine snapshots were supplied for this candidate, so their unpublished remote implementations were not reviewed. Their existing maintenance contracts are checked against the pinned installed runtime by the existing tests.

## Lean author reuse decisions

Read the complete before/after index.ts of each lean author and compare against local adapters; read both package.json versions, current author usage docs and the tests for the added behavior.

| Package | Author change | Decision |
| --- | --- | --- |
| Web | Infer omitted op from fields/text, serialize object input, merge top-level upstream fields, reject conflicting fields; extract pure path predicate | Do not adopt optional input repair in this minimal dependency update. Keep explicit op and string JSON input, already compatible with 0.43. Preserve the existing upstream prepareArguments forwarding. |
| Web | Existing retrieval/404 hint rewriting remains | Continue the recorded decision to return content literally: a page can contain an exact matching tool-call example. |
| Todo | Four .js deep imports become .ts | Already applied locally in the preceding 2.13.9 update; no duplicate change. |
| Todo | Infer get from bare id (optionally includeDeleted), strengthen prompt to require per-step transitions and forbid end-of-task batching | Leave optional inference and stronger workflow guidance outside this compatibility update. Keep current create/update inference, explicit get and one-in-progress guidance. |
| Todo | Existing RPC withHostPlan still reads ctx after await without local stale guards | Continue not adopting this output expansion; preserve local guarded contexts and awaited /todos commands. |
| Subagents | Infer run/result/steer, serialize object input, normalize render arguments, change prompt wording to op=run | Do not adopt optional input repair. Keep explicit op, string JSON input, direct-field precedence and existing render delegation. |

These are explicit scope decisions, not unreviewed acceptance of author HEAD. No tools or existing rules are removed. Tests added by the author for these unadopted features are not copied. Author wrapper versions (web 0.42.2, todo 2.13.12, subagents 0.22.4), lockfiles, Pi 1.3 benchmarks and dev-dependency changes are not substituted for this repository's fixed metadata and measured bilingual documentation. Todo author pins catch up to the already installed 2.13.9; author web remains on 0.42 and subagents on 0.22. No local adapter source changes are necessary.

## Web 0.43 behavior and contract review

Compared before/after changelogs, package metadata, search/check/fetch/get registration schemas and execution paths, gemini-search provider selection/routing, DeepSeek search/fetch, xAI configuration and extraction routing/short HTML handling. Read new linkup.ts and the response/storage paths in web-tool-contract.ts and web-tool-core.ts. Detailed evidence is recorded in web MAINTENANCE.md.

- No tools or call fields added/removed. Provider choices gain Linkup, automatically shown by search/check help and passed through advanced JSON. numResults=5, workflow=none, readable fetch and dependency/peer ranges remain unchanged.
- Linkup uses linkupApiKey/LINKUP_API_KEY, explicitly selected or configured in routing; auto/all exclude it. linkupDepth is a configuration option (flash/fast/standard/deep, default fast), not a new tool parameter. Domain/date filters and returned inline page content are supported.
- DeepSeek includeContent requests need_content and stores supplied page bodies without refetching covered URLs. Search content keeps literal backslashes; hosted Fetch normalizes its Markdown. DeepSeek Fetch requires explicit fetchRouting membership and allowRemoteHostedProviders=true, and remains outside the default order. URL/domain preflight and same-origin redirect restrictions remain enforced by upstream.
- Only a config-default provider array can continue into searchRouting after every failure matches fallbackOn, skipping tried providers. Explicit per-call arrays remain strict. providerFromConfig is internal metadata forwarded by core/curator, not a caller field.
- xaiResponsesUrl accepts absolute HTTP(S) endpoints and uses only configured/environment xAI keys there, bypassing Pi subscription auth. xaiSearchTimeoutMs defaults 60,000 and caps positive integers at 600,000. Bilingual docs describe these as configuration.
- Nonempty extracted short static HTML can succeed when its visible text is under 500 and it has no executable scripts. Data scripts do not count as executable. Incomplete errors provide character counts; no blanket acceptance of empty or script-driven pages is promised.

Default-name routing, five-argument execute, upstream array normalization, loader removal, active-tool suppression and the independent local PDF branch remain compatible. search structuredContent holds results/snippets plus fetchId, not full page bodies; get returns rendered title/body blocks; fetch structuredContent.urls[].content holds the extracted body independently of rendered storage guidance. Results remain unmodified by the adapter.

## Verification boundary

Added only packages/pi-web-access-lean/tests/upstream-043-regression.test.mjs. It installs DNS/fetch mocks before all imports, uses absolute HTTPS URLs and fake keys, rejects unexpected destinations, and exercises the real facade's help/Linkup JSON normalization, DeepSeek content/get, config-default versus explicit-array fallback, and readable short HTML/opted-in hosted fetch. Assertions distinguish rendered tool text, search structured data, stored body and fetch structured body. All baseline assertions remain intact; no unrelated upstream internal tests are imported.

The fixed check gate captures current contracts and ceil(chars/4) measurements, updates measured bilingual docs, and executes typechecks/tests, contract checks, independent fresh production installs and both audits in a credential-free Linux sandbox. The tool output is the validation evidence; no success is presumed here. Character proxies are not billing tokens. No real Linkup, DeepSeek, xAI gateway, model or subagent was contacted. Exact-commit three-platform CI and fixed-host merge/release validation remain subsequent gates. No personal installation, node_modules implementation, publication/CI infrastructure or credentials were modified.
