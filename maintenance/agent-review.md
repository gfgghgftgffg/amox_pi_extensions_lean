# Source review

## amox-pi-sync UI revision

- Comparison base: `794d47b1d651b3470f6320cde2821fd6de4827f1`. This is the owner's requested local UI revision, not adoption of an upstream publication. Upstream remains `pi-sync-suite@0.1.1` / `npm:pi-sync-suite@0.1.1`.
- Changed runtime file: `packages/amox-pi-sync/index.ts`. `core.ts` is unchanged. No dependency, data format, sync path, migration, deletion, transport or scheduling policy changes are introduced.
- Checked the installed Starline v1 pill API types and actual bubble renderer. Informational rows support ANSI text; clickable rows own their selected foreground/background. The extension uses semantic Pi theme colours for information and bold-only targets, leaving selection contrast with Starline rather than painting conflicting action colours.
- State displays Manual, Auto or Off without idle parentheses. Active operations use Push/Pull/Check, with configured mode shown separately while busy or errored. Status keys and centered placement remain compatible. Objects becomes Paths; timestamps and command/menu descriptions follow the same terminology.
- Menu presentation and semantic action IDs are separated. The mode picker marks the active mode; cancellation and close-before-callback behavior are retained. Backup and cleanup titles are shortened while descriptions and confirmations preserve the original safety scope.
- Action results remain in notifications; status records a compact completion/failure label instead of embedding diagnostic JSON. Terminal controls are removed from external display text. Theme styling is computed from the current context, not saved in settings. RPC explicitly uses plain native UI even if a Starline bridge exists.
- The pre-push fingerprint branch now follows the Push operation label; it still captures only the pre-push snapshot so concurrent edits remain observable. Manual/off startup stays network-free; busy actions still suppress duplicate operations; restore and cleanup confirmations remain mandatory.

## Verification and release selection

- The UI change passed 268 local tests, contracts and independent sync production loading before release staging, with zero skips. Added regressions cover theme roles, selected-row colour ownership, theme changes, stable settings selection/current-mode marking, Push/Pull fingerprint behavior, check-result tones, terminal-control removal, native/RPC fallbacks and compact diagnostic history.
- Actual installed Starline rendering was exercised with dark/light themes, status/settings views, 24/40/64-column bubbles and selected/unselected rows: 24 combinations without horizontal overflow. No user sync settings, personal remote, installed Starline code or paid model was used or modified.
- Release batch `0.1.18` selects only `amox-pi-sync@0.1.2`, with exact base `794d47b1d651b3470f6320cde2821fd6de4827f1`. Web remains `0.1.15`, todo `0.1.13`, subagents `0.1.16`; their publication files are unchanged.
- Fixed release validation must confirm this package-only scope, version/lock/manifest consistency and archive contents. PR CI must accept the exact submitted head on Linux, macOS and Windows plus all-platforms-pass; Release independently accepts the merged SHA. npm success additionally requires actual OIDC job success and matching public registry latest/integrity.
