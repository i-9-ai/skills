# Development editor dependency remediation

## Objective and authority

Close the remaining dependency gate Beads `i9-skills-753` / issue102 before a
future release of [PR107](https://github.com/i-9-ai/skills/pull/107). Replace the
affected development-only editor dependency chain without changing top-level
requirements, runtime behavior, plugin permissions or release automation.
No publication, merge, native installation or real skill mutation is included.

## Verified source and scope

The starting lock at7d3fafc7791d2686b832020eed63750582c1be2a selects
`@changesets/cli@3.0.2 → launch-editor@2.14.1 → shell-quote@1.10.0` as development
dependencies. Changesets imports the editor in its interactive add flow;
`launch-editor/guess.js` calls `shellQuote.parse`. This does not demonstrate the
advisory's `quote()` exploit path or establish that the package was exploited.
The installed panel runtime bundles pinned YAML, not these editor dependencies.

Primary GitHub advisories checked2026-10-24 identify patched versions:

- [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv):
  shell-quote quote handling; first fixed1.11.0.
- [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv),
  [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) and
  [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm):
  launch-editor argument/path handling; first fixed2.14.2.

The npm registry supplies launch-editor2.14.2 and shell-quote1.12.0 within the
existing transitive ranges. Refresh only those lock entries and their declared
dependency metadata/integrities. Do not upgrade direct dependencies, add an
override, alter package versions or disable advisory checks. If resolution
changes unrelated entries, inspect and narrow the update before proceeding.

## Sequence, verification and rollback

1. Use a project-owned ignored npm cache; do not repair home-cache permissions.
2. Generate the scoped package-lock-only update with scripts disabled. Inspect
   every changed entry and compare integrity with exact-version registry data.
3. Run explicit npm ci on Node24, full and omit-dev audit, npm run check,
   npm run package:check, npm run changeset:status and git diff --check.
   Exercise Changesets' existing noninteractive version/packaging regression;
   do not launch an editor or run an exploit as verification.
4. Add a patch Changeset. This introduces no new user capability; existing
   English/PT-BR/ES dashboard promotion stays accurate and needs no new claim.
5. Obtain independent review on the exact commit, push to the same PR and verify
   exact-head CI. Record evidence and close only the dependency task. Keep native
   and public acceptance tasks blocked rather than treating audit zero as release
   or provider readiness.

Revert this lock/Changeset change together if needed; reinstall from the restored
lock. This restores the old advisory exposure and therefore reopens the release
gate. No user data, proposal, installed plugin or global skill is touched. Preserve
the current root → plans instruction boundary and add only this linked recipe.
