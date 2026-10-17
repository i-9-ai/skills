# Simplify automated Changesets releases

## Objective and scope

Use the official Changesets actions directly, following the workflow structure
requested by the owner. Remove custom release reconstruction, GitHub-reference
record/replay, manual preparation commands and historical backfill. Retain npm
OIDC publication through `release.yml`, official pack/publish artifact transfer,
package checks and the independent public availability check.

The owner defines automated version preparation as the only supported path.
Manual release-artifact alteration is outside the supported workflow. This work
does not merge, dispatch publication, change npm publisher settings or install
anything into a consumer.

## Implementation and acceptance

1. Delegate mode selection and version generation to the pinned official actions.
2. Use `changeset version`, npm lockfile refresh and inline plugin-version sync.
3. Remove replaced source, commands, tests and prerequisite-only scripts; update
   release documentation, CLI help, indexes and a major Changeset for removals.
4. Run explicit `npm ci`, `npm run check`, `npm run package:check`,
   `npm run changeset:status` and `git diff --check`; review the exact commit
   independently. Rehearse version generation only in disposable fixtures.

No skill package changes are planned. Local checks establish structure and
synthetic behavior; hosted Actions and npm publication remain unexercised.

## Instruction map

Retain the existing root -> source -> command, tests, plans and documentation
boundaries. Remove source/command index entries for retired release components,
retain one package-version reader entry, and add this plan to the plans index.
No new instruction scope or package procedure is introduced.

## Reference and reuse

Inspect the owner's `coisa/error-handler` Changesets workflow at revision
`ae8b3fa89d80bbe78b1067eb1ae384eebae48234`, reviewed file
`.github/workflows/changesets.yml`, for the official action sequence. Implement
repository-specific YAML using existing action pins;
do not vendor its workflow, Dependabot/comment jobs or Composer-only publication.

## Rollback

Revert the simplification commit as one unit, restoring the workflow, commands,
tests and documentation together. Preserve the existing `release.yml` npm
publisher identity throughout; no external configuration change is required.
