# Source review

## Scope

Review the staged pi-web-access 0.45.0 → 0.46.0 update. Exact source inventory revisions are `35e57ef30f4b8ac771f4062a381493993af41ebe` → `4af1a7f7757d450ba0afefe2d98737384dc9a9b4`; the newer remote HEAD `fc63125608faef80c446687c79edd2626f511019` is outside this candidate. Dependency and wrapper versions were staged by the fixed script. All three lean-author revisions are unchanged, so there is no new author implementation to reuse. Todo/i18n remain 2.15.0 and subagents remains 0.22.0; no new snapshots of those engines were supplied.

## Findings and minimal adaptation

Compared both changelogs and package metadata, search/check/fetch/get registration and execution boundaries in index.ts, fetch-params.ts, web-tool-contract.ts, the PDF result interface and Markdown writer, extract.ts routing tables and HTTP/PDF branches, source-check.ts artifact fields, and gemini-search.ts provider lists. Read the new Cloudflare, SearchApi and Tabstack configuration/request/response paths. This is a facade compatibility review, not an exhaustive upstream security audit.

There are no business-tool additions/removals or call-field/required changes. Search result count, workflow and readable fetch defaults remain unchanged. Cloudflare, SearchApi and Tabstack are new explicit search choices; all stay outside auto/all. Existing on-demand help discovers them through getAllowedSearchProviders and advanced JSON delegates their parameters. Cloudflare defaults to Ceramic and the default AI Gateway; SearchApi reads Google organic_results; Tabstack defaults to fast and returns a report with cited pages rather than a truncated list. New hosted Exa/Tabstack fetch routes require explicit configuration and remote-hosted consent. These settings do not become resident facade schema fields.

The PDF return contract removed pages/chars and retains title/content/outputPath. The local adapter previously read the removed counters and returned only a save notice. It now includes the returned Markdown after the saved-path notice, derives totalChars from that Markdown and preserves pages only when the extractor's metadata header reports it. Header parsing stops before the body so a body line cannot invent a page count. The protected historical declaration stub is left intact; the adapter declares the reviewed current result shape at the extraction call boundary. Existing baseline save-notice and five-page assertions remain intact.

Remote readable PDF content intentionally contains the saved-path notice plus Markdown in structured and stored results. Answer/extract receive the Markdown itself. Tests distinguish these from rendered get output, which can add headings and pagination. Local PDF handling retains its existing independent behavior and does not acquire response storage or answer-model execution.

Mixed-case MIME normalization and optional curl transport are delegated upstream. Source-check artifacts can now identify generated snippets/provider-summary passages. Other changelog fixes include Exa free-search errors, summary-model diagnostics, minimum answer thinking, proxy reload persistence and curl redirect/partial-response/URL handling. Those internal fixes are consumed via the pinned dependency; this review does not claim live validation of all those paths.

Default-name routing, five-argument execution, prepareArguments delegation, legacy provider-array compatibility, loader suppression and active-tool interception remain applicable. The single resident web_access tool and op/input schema remain stable. Subagents still uses the npm-provided dist/index.js; lean packages retain index.ts, and web/todo retain their runtime entries. No upstream implementation, node_modules, SDK version, CI workflow or publication infrastructure is changed. The host-side sandbox portability fix is described below.

## Host sandbox portability

The Linux sandbox read-only mounts `realpathSync(process.execPath)` at `/opt/amox-runtime/node` and prepends only that fixed directory to its sanitized PATH. This supports setup-node tool-cache installations without assuming `/usr/bin/node` exists. Only the executable is exposed, not its parent distribution directory, the host PATH or additional host home files. The sandbox command uses `node` through that fixed PATH.

The original credential, hidden-host-home and read-only-source assertions are preserved, with an additional assertion that the executed binary is the private mount. New regressions verify the executable-only mount and run the real sandbox from a copied Node executable outside `/usr`, asserting that its toolchain directory and fake credential stay hidden and candidate writes still fail with EROFS. These are owner-authorized host-side changes after the automated adaptation stopped; no automated model is allowed to rewrite protected check infrastructure.

## Documentation and verification

Updated the existing English and Chinese PDF feature descriptions and the package maintenance record. Added only upstream-046-regression.test.mjs for new-provider help/JSON execution and local/remote PDF text compatibility. DNS and fetch mocks are installed before imports, requests use absolute HTTPS URLs and synthetic credentials, and unexpected targets fail. Coverage includes missing page counts and a misleading Pages line in body text, saved Markdown equality, mixed-case remote PDF MIME and stored continuation.

The check tool captures current contracts and character measurements, updates measured documentation, and executes typechecks, all existing assertions and focused regressions, standalone production installs and both dependency audits. Its actual result is authoritative; ceil(characters/4) is a comparison proxy, not billing tokens. Advisory findings are warning-only under owner policy, while audit execution failures must remain visible. Live paid providers, curl-impersonate and interactive behavior are outside offline coverage. Exact-commit three-platform PR CI and independent Release verification remain the fixed host workflow's responsibility.
