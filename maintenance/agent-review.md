# v0.1.5 distribution and automation review

Base: `700a341dfeefe6233116be56de2687646ec060bf` (PR #12 merged after exact-head Linux/macOS/Windows CI).

## Release scope

This is a distribution/documentation patch release, not an upstream adaptation. The version change ships the npm installation instructions, shorter user-facing documentation, and the release/automatic-merge fixes already reviewed in the base. No new model run or upstream version proposal was used to prepare it.

- Root, all three workspace packages and manifest move together from 0.1.4 to 0.1.5. The root remains private; each extension has public npm access.
- All `index.ts` entrypoints are unchanged. Web stays at 0.41.0, todo/i18n at 2.13.8, and subagents at 0.22.0. Upstream and lean-author source revisions are unchanged.
- Pi development SDK, peer requirements, Node baseline and every resolved dependency/integrity in the lockfile are unchanged. Only root/workspace version records change in the lockfile.
- Both README languages prefer unpinned public npm installation and `pi update --extensions`, retain the per-extension Git fallback, and distinguish local-directory updates from npm updates. Published package links to the repository use absolute GitHub URLs.
- The README review-history cleanup is included without adding new per-release sections. Detailed historical adaptation records remain in package MAINTENANCE files and earlier Git revisions.
- The base's fixed host merges only its own exact-head maintenance PR after three actual successful platforms and `all-platforms-pass`, with PR/base/main rechecks and a conditional head-SHA merge. Failed, foreign, draft or uncertain cases stop; no direct main push or mutation retry is substituted.
- The base's npm publisher submits missing verified archives once before read-back validation, sharing a ten-minute GET-only visibility deadline. Existing identical versions skip; immutable conflicts fail. A lagging registry response never causes an automatic upload retry.

## Acceptance boundary

The fixed local check gate captures current contracts and character measurements, runs typechecks/tests, three independent production installations and both security audits inside a credential-free sandbox. Existing assertions and package test exclusions remain intact. The resulting candidate must still pass independent three-platform PR CI; Release then separately validates the merged immutable SHA and all three archives.

The GitHub `release` environment has been independently read back as main-only with no human approval rule. npm trusted-publisher setup and successful OIDC publication are separate acceptance steps: this review and a green PR CI do not prove npm publication succeeded. The real Release npm job and public registry archive hashes are the final evidence.

No personal Pi installation, installed extension source, model credential or npm login state is part of this candidate. Published 0.1.4 versions and their GitHub tags/assets are not overwritten.
