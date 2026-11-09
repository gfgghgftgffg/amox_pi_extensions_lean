# Source review

## amox-pi-sync SSH and Starline revision

- Comparison base: `7634ef54e5148a82b560c5d6477fac26211ec52d`. Owner-requested fixes; upstream remains `pi-sync-suite@0.1.1` / `npm:pi-sync-suite@0.1.1`.
- `core.ts` prefers Windows native OpenSSH when present, falling back to `ssh`. The executable path is quoted and normalized for Git's command shell. Batch mode, connection timeout and host-key verification are retained. The command regression derives the expected executable from the actual platform and installation.
- Checked the installed Starline v1 public pill API and bubble renderer: anchor geometry controls cell attachment; background/foreground control border and selected-row contrast. Sync forwards the clicked geometry through status, settings, submenus and confirmations. Direct commands reuse the last clicked anchor, with a centered fallback before a cell is known.
- `bubbleColor` optionally selects pill (default), accent, success, warning or error. Follow pill forwards the capsule colours; before a click it uses theme accent. Explicit choices resolve current Pi theme foreground SGR to background SGR at render time, leaving contrast text calculation to Starline. Only the semantic choice is saved. Changing colour does not restart timers or transfer data.
- Without Starline, native Pi dialogs remain responsible for rendering and the Starline colour option is hidden. RPC stays plain/native even if the bridge exists. No Starline runtime dependency or installed-package edits are introduced.
- Regression coverage includes anchor geometry and colours across nested menus and confirmations, colour persistence, theme changes, ANSI/truecolour/256-colour conversion, native/RPC fallbacks and rejection of invalid colour configuration. Existing sync data, path, backup and cleanup guarantees remain unchanged.

## Release selection

Local verification passed: sync typecheck and all 42 sync tests, all 143 repository integration tests, scoped contracts and isolated production installation/loading. Dependency audits completed with upstream warnings (production: 6 affected packages, including 2 high-severity findings), not introduced by this dependency-free patch.

Release batch `0.1.19` selects only `amox-pi-sync@0.1.3`, based on `7634ef54e5148a82b560c5d6477fac26211ec52d`. Other packages keep their versions and publication files. Local scoped checks, contracts and production loading must pass before submission; exact-head Linux/macOS/Windows CI and independent merged-SHA Release verification are required before publication. The Windows Chinese-directory live check was reported by the owner; this Linux host does not claim to reproduce that Windows environment.
