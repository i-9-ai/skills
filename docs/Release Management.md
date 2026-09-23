# Release management

## Purpose

This repository uses [Changesets](https://github.com/changesets/changesets) to record pending release notes and semantic version intent. It provides a reviewable path from an accepted change to a versioned changelog without treating a merged pull request as an automatic release.

## Normal contribution flow

1. Make and validate the change.
2. Add a Markdown entry under `.changeset/` for a user-visible release change with `npm run changeset`.
3. Review the resulting version intent and release-note wording in the pull request. Reconcile the note against the complete user-visible diff: describe concrete capabilities, commands or interfaces when material, and meaningful limits. Do not use a generic summary when one Changeset represents a broad foundational delivery.
4. Run `npm run changeset:status`; GitHub Actions performs the same read-only validation.
5. Merge the change only through the usual repository review process.

Changesets may be omitted only for changes that have no user-visible release note, such as purely local test-fixture maintenance. Explain that decision in the pull request.

## Release preparation

An authorized release-preparation task runs `npm run release:prepare`. It consumes the pending entries, updates `package.json`, and updates `CHANGELOG.md` for review in a dedicated version pull request. It does not publish an npm package, create a tag, create a GitHub release, change repository visibility, or distribute skills to a registry.

Those external effects require a separate explicit decision and their own evidence. If the project later automates release-pull-request creation, it should use the official Changesets GitHub Action at an immutable reviewed revision, with only the minimum write permissions needed for that task.

## Current scope

The current workflow validates Changesets configuration and pending entries on pull requests and `main`. It has read-only repository permissions. No release automation is active.
