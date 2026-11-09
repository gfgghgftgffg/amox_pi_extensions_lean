# Source review

## amox-pi-sync menu labels

- Comparison base: `4cc4cc7b421c667a470c189ad5bd4dc627d22ede`. Owner-requested presentation-only patch; upstream remains `pi-sync-suite@0.1.1`.
- `index.ts` separates informational labels and values with a colon. Settings show `Mode: Manual`, `Paths: 2 configured` and `Bubble colour: Follow pill`. Starline action rows start with `•`; native Pi selectors keep their own indicators.
- Semantic action IDs, selection callbacks, colour handling, cell anchors, configuration and all sync operations are unchanged. Existing UI assertions track the new text and bullet prefix.
- Local tests were intentionally not run at the owner's request. Existing exact-head three-platform CI and merged-SHA Release gates remain enabled.
- Release batch `0.1.20` selects only `amox-pi-sync@0.1.4`, based on `4cc4cc7b421c667a470c189ad5bd4dc627d22ede`. Other package versions and publication files are unchanged.
