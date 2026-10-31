# Source review

## Scope

Review the staged pi-subagents 0.22.0 → 0.22.1 update. The exact supplied source revisions in sources.json are `85a704cb8f35c96c0cabfa665b572bab296942e5` → `fc089c4b7ab0f1185453b2e53027997c1f637e38`. The newer remote HEAD `f42173ff5535397ed4957364ef819d39791bcf4f` is outside this candidate. The fixed script already staged dependency and wrapper versions and selected only pi-subagents-lean. Web and todo are unchanged. All lean-author revisions are unchanged; subagents remains at `b084c51a7ec3fa6737b108ca3583e3d71075874f`, with its earlier optional input-inference feature review retained in MAINTENANCE.md.

## Reviewed boundaries and findings

Compared before/after changelogs and package metadata; complete invocation-config.ts, cross-extension-rpc.ts, prompts.ts and agent-runner.ts; index.ts initialization, usage/steer callbacks, RPC binding, shutdown, Agent schema/execution/rendering, workflow registration/execution and result/steer tools; and agent-manager.ts resume, detached resume, outcome and steer paths. This is a facade compatibility review, not an exhaustive upstream audit.

No model tools are added or removed. Agent still requires prompt/description/subagent_type, with name/model/thinking/max_turns/run_in_background/resume/isolated/inherit_context and settings-dependent isolation/schedule optional. Result still takes agent_id and optional wait/verbose, steer takes agent_id/message, and workflow takes script/scriptPath/name/args/resumeFromRunId/title/description. Types, required fields and constraints remain compatible. The resume description now explicitly promises a fresh max_turns budget; the existing help path exposes this current description automatically. Five-argument execution and render interfaces remain compatible.

Invocation resolution and configured defaults are unchanged: frontmatter precedence, top-level background default, fresh conversation default, optional worktrees, result wait/verbose false. Pi >=1.1.0 and typebox * peers and upstream runtime dependency ranges remain unchanged. Thinking inheritance is repaired in runAgent: an unset option/file value now falls back to the parent's current thinkingLevel instead of falling through to the host default. The facade already passes advanced thinking through JSON input and does not need another resident schema field.

Resumed prompts now share observeRun with initial spawns. Each prompt starts a new turn counter, steers at the soft budget and aborts after grace turns. Agent resume resolves the budget for the stored record's type, rather than its ignored subagent_type input, and passes it through both foreground and background resume. Foreground resume also tracks tool activity/turn counts and installs a fresh abort controller. Settled outcomes preserve an external stopped status and can report steered/aborted. Existing facade execution returns the complete upstream result object unchanged, including content, details and usage, and delegates rendering; displayed cards and result text remain separate interfaces.

Append-mode inheritance now strips the parent's rendered skills/cwd/following extension sections before building the child prompt. It retains the preamble, addendum and project context; prompts without the expected cwd marker are unchanged. This prevents duplicate sections and keeps the child's own skills selection authoritative. The implementation remains upstream-owned.

The new subagents:rpc:steer is an event-bus method, not another model tool. It requires a nonempty string message and an ID for a top-level record, shares stop's ownership guard and rejects settled agents. The protocol remains v2. Manager steering now emits through its callback for viewer/fleet/mention/RPC paths; the mention path removes its previous duplicate emit, while the steering tool keeps its awaited delivery/event path.

subagents:usage emits each assistant-message usage delta for all agents, including nested/workflow children, independently of reportUsage. It carries effective invocation metadata, depth and available ownership fields, omitting unknown optional metadata. Existing top-level lifecycle totals and optional tool-result usage remain in place. Shutdown unregisters the new RPC listener and emits subagents:disposed after awaiting manager disposal; final ledger listeners must flush synchronously because the event bus does not await them. The facade's method binding, events and lifecycle forwarding preserve these additions without interception.

## Minimal adaptation and verification

Leave index.ts unchanged. The npm-provided dist/index.js remains the runtime entry; no source fallback, local compilation, copied upstream implementation or node_modules changes are introduced. Typebox v1 validation/instancePath, startup type-description parsing, direct-field precedence, captured withUsageReporting delegation, conditional workflow registration and upstream rendering continue to apply.

Update only this package's English/Chinese README links within the existing usage guidance, and record detailed behavior changes and exact revisions in its MAINTENANCE.md. User READMEs continue to describe runtime updates generically and link upstream parameters/settings/events/RPC. The fixed check refreshes character measurements and contracts; ceil(characters/4) remains a comparison proxy, not billing tokens.

No facade change requires a new regression. Preserve all baseline assertions and run the existing facade, real-dist integration, source/dist contract parity and notification/usage/scope/isolation coverage. Do not copy unrelated upstream tests. No network regression is added. Live provider/model tasks, interactive UI and real ledger integrations are outside this offline validation.

The check tool's actual output is authoritative for typechecks/tests, contract validation, fresh standalone production installation and both dependency audits. Audit advisories are warning-only under owner policy; an audit execution failure must remain visible. Exact-commit three-platform PR CI, automatic merge preconditions and independent Release validation remain the fixed host workflow's responsibility.
