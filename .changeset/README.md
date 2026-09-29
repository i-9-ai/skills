# Changesets

This directory holds one Markdown changeset for each user-visible release change. A changeset records the intended semantic version impact and release-note text before a release is prepared.

Run `npm run changeset` to create a new entry. Run `npm run changeset:status` to inspect the pending release state. Only an explicitly authorized release-preparation step may run `npm run release:prepare`, which consumes changesets, updates the package version, and updates `CHANGELOG.md`.

Changesets do not publish packages, push tags, create GitHub releases, or change repository visibility. Those remain separate, authorized actions.
