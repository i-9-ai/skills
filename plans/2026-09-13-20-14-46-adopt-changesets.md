# Plan: adopt Changesets for pending release notes

## Objective

Adopt the Changesets CLI as the repository's reviewable format for user-visible release notes and semantic version intent. Prepare release management without publishing packages, creating tags, creating GitHub releases, or changing repository visibility.

## Scope

1. Add the exact `@changesets/cli` development dependency and its lockfile.
2. Create `.changeset/config.json` for this single-package repository, enabling version calculation for the unpublished npm package while disabling package tagging.
3. Add a changeset for the initial public-ready collection so the release candidate can be promoted through an authorized future version-preparation task.
4. Add documented commands for creating an entry, inspecting pending status, and preparing a version.
5. Add a read-only GitHub Actions workflow that installs locked dependencies and validates the pending Changesets state on pull requests and `main`.
6. Document contributor expectations and the boundary between version preparation and external release actions.
7. Keep root dependency directories ignored by collection validation while rejecting them if tracked.

## Explicit exclusions

- No npm publication, registry upload, tag, GitHub release, release pull request, or automatic version preparation.
- No Changesets GitHub Action with write permissions at this stage.
- No conversion of historical `CHANGELOG.md` content.
- No requirement for a changeset when a pull request has no user-visible release note; that exception must be explained in review.

## Design decisions

Changesets is the pending-release-note source of truth. `CHANGELOG.md` remains the rendered historical record and changes only in an explicitly authorized version-preparation task. The `release:prepare` command runs `changeset version`; it is intentionally a local preparation command, not a release command.

The workflow has `contents: read` only. It validates configuration and entry parsing with `changeset status`, so it cannot publish, tag, open a release pull request, or mutate repository history.

## Acceptance criteria

- `npm run changeset` can create a new entry.
- `npm run changeset:status` reports the pending version impact for the private package.
- `npm run release:prepare` is documented but not invoked by CI.
- The Changesets workflow installs from the lockfile and has no write permissions.
- Repository validation ignores an untracked `node_modules/` directory but fails if that directory is tracked.
- `npm run check` and `git diff --check` pass after the integration.

## Evidence to retain

- Exact CLI version in `package.json` and `package-lock.json`.
- The initial `.changeset/` entry and status output.
- The read-only workflow definition.
- Validation output at the candidate revision.

## Execution status

Implemented in this PR: the pinned development dependency, lockfile, configuration, one broad pending entry, read-only validation workflow, and contributor documentation. `npm run changeset:status` reports the expected patch impact. Version preparation, tags, releases, and publication remain intentionally unexecuted.
