# Source review

## Exact sources

Todo and related i18n move from 2.13.9 `54df50eea935fc9753edc300d5f23c5e28d906d7` to published 2.15.0 `ce6d3530410812ca504ec294995581a52170f9e1`. The supplied before/after sources and CHANGELOG cover batch creation, error-card rendering and corrupt-snapshot replay. The newer remote head is not substituted for the published source.

Web remains 0.44.0 and subagents remains 0.22.0. Their source pins and all three lean-author revisions remain unchanged. Pi SDK/peer requirements and build dependencies remain unchanged. No new model call was used to recover this retained candidate.

## Adaptation

- Keep all six todo actions and every upstream field, including the complete nested `tasks` schema. Batch creation remains atomic; per-task fields belong on each item, and dependencies can reference existing tasks but not siblings in the same batch.
- Delegate upstream argument normalization before existing single-create/update inference. Batches require explicit `action: "create"`. Keep upstream execution, persistence, rendering and replay; no reducer or normalization implementation is copied.
- Clone the parameter schema before compacting it, leaving the upstream schema untouched. Remove verbose descriptions while preserving input fields named `description`. A string-only enum needs no redundant string type; unrestricted object metadata needs no empty pattern. These reductions preserve validation and all native fields.
- Compress the description and single guideline while retaining the existing task, status, filtering, clearing and dependency rules. Keep the original 1200-character metadata ceiling; batch details are documented in the existing bilingual usage sections, not a release log.
- The maintainer explicitly authorized two obsolete expectation updates in `wrapper.test.mjs`: the current description and the added `tasks` field. All behavior assertions and the budget assertion are retained. No test-dependent behavior or hidden parameter is introduced.

## Verification

The focused real-runtime regressions cover schema equivalence on valid/invalid single and batch inputs, preservation of the upstream schema, normalization, atomic rejection, existing dependencies, one persistence entry, RPC lifecycle replay after a corrupt snapshot, and delegated batch/error rendering. The fixture shares the actual state graph rather than resetting a second loader instance.

The fixed local gate captures contracts and character measurements, runs typechecks/tests, three standalone production installations and both security audits in the credential-free sandbox. The two explicitly approved expectation changes are checked against the original base; all other baseline assertions remain protected. Actual logs provide the acceptance result. Exact-head three-platform PR CI and merged-SHA Release verification remain required before publication.

No personal installation, credentials, node_modules implementation, check infrastructure or publication permissions are changed. Character proxies are not billing tokens; interactive terminal behavior and paid/live services are not claimed as verified.
