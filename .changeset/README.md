# Changesets

This directory holds one Markdown changeset for each user-visible release change. A changeset records the intended semantic version impact and release-note text before a release is prepared.

Run `npm run changeset` to create a new entry. Run `npm run changeset:status` to inspect the pending release state. The authorized default-branch Changesets workflow opens a draft version PR using `npm run release:prepare`, which consumes notes, generates `CHANGELOG.md`, and aligns package, lockfile and plugin versions. Review that PR and its current-head checks before merge; see [Release Management](../docs/Release%20Management.md).

After the reviewed version PR merges, the release workflow checks and packs the compiled package, publishes it through the scoped npm trusted publisher, and creates its Git tag and GitHub release. Adding a note alone does not upload a package. Repository visibility, marketplace submissions and consumer installations remain separate actions.
