# Staged upstream source review

## Sources and scope

- Web engine: 0.41.0 `d47dc040552505e3b135d0136a0b15eaf4bdba52` → 0.42.0 `18e36f9e0fc2de3c9895a7fda8d39a62ce60f49e` (also remote HEAD).
- Web lean author: `c2beefc20ff6ed52a376d5ddaf9a91bcf3a7a09a` → `09262708ad57726d1a4b3c22b084fb84ea22281b`.
- Todo and coupled i18n: 2.13.8 `afc21bc25f7d07cae9fb3103dc309240a16b9f49` → 2.13.9 `54df50eea935fc9753edc300d5f23c5e28d906d7`. Remote `d3c6f0812140605a4e55e0a660eb83edc12abbc5` is not the release snapshot. Lean author is unchanged.
- Subagents stable remains 0.22.0 `85a704cb8f35c96c0cabfa665b572bab296942e5`; lean remains `3082c5fb3dada95f2dabffa6a20db0bf43e03a62`. Remote `ca93a5247e72e7053fcd10bea7125d6c4205f949` is unpublished and not adopted. No subagents snapshots were supplied for this update; no remote-source review claimed.

Read all three MAINTENANCE files first. Exact before/after sources are those listed in supplied sources.json, treated as data. Review is focused on facade compatibility, not a full upstream security audit. Detailed evidence and historical adaptation decisions are in the two changed packages' MAINTENANCE files.

## Reuse decisions and adaptations

Web author entrypoints are identical. Package metadata updates the wrapper version, description benchmark and engine pin. English and Chinese READMEs update versions and measurements; tests update the help title and add DeepSeek. Consume the staged dependency, retain local packaging/host versions and recapture local measurements. Do not import the author's existing broad result-text hint rewriting: the prior literal-page preservation decision still applies. Existing normalization forwarding is already implemented locally. No web adapter source change is needed.

Web 0.42 adds DeepSeek to provider choices, automatically disclosed by search/check help and passed via input JSON. No tool or call field is added or removed, and call defaults remain unchanged. DeepSeek requires explicit selection/configured routing and a key; auto/all omit it. Domain/date operators count toward the 128-Unicode-character query ceiling. New toolExposure config defaults direct; deferred forces dynamic and conflicts with eager. Captured exposure is not copied onto the facade, so web_access remains directly registered and upstream active-list mutation remains suppressed. Bilingual usage docs explain this boundary. Page answering and summary generation prefer host registry streamSimple, enabling virtual-model routing while retaining auth/scope checks and fallbacks. Windows credential commands prefer Bash; GCE ADC may obtain metadata tokens when no ADC file is selected/present. These dependency behaviors are documented without copying implementations.

Todo/i18n 2.13.9 name published .ts files in relative imports to avoid jiti fallback work. Reviewed todo entrypoint, schema, store, replay and overlay before/after plus the coupled i18n entrypoint/changelog. No task operations, defaults, persistence format or overlay field contract changes. Change only four local deep imports from .js to .ts; keep the existing RPC isolation, stale-context and awaited command protections. Existing tests retain .js imports and assertions and exercise shared state across both paths. No unrelated upstream test suite is added. rpiv-config's range advances to ^2.13.9; its source is not present in this inventory, so no separate source audit is claimed.

## Verification boundary

New focused web regression installs DNS/fetch mocks before upstream imports, uses absolute HTTPS URLs and a fake API key, and rejects unexpected transport destinations. It exercises DeepSeek help/JSON normalization/request and too-long-query errors, deferred registration with stable facade identity, and answer-mode forwarding to a mocked host streamSimple. Assertions distinguish rendered text, structured result data and stored original content; response shapes were inspected in web-tool-contract and web-tool-core. Existing baseline assertions remain intact.

The fixed check gate captures contracts and ceil(chars/4) measurements, updates measured docs, and runs actual typechecks/tests, contract verification, fresh independent production installs and both audits in a credential-free Linux sandbox. Its output is the candidate validation evidence; this document does not predict success. Character proxies are not billing tokens. No real DeepSeek, GCE, Windows Bash or virtual-model endpoint was contacted. No personal extension install, CI/publication infrastructure, credentials, main push or release action was changed. Three-platform exact-commit CI and fixed-host merge/release validation remain subsequent gates.
