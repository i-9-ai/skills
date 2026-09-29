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

## Prepare a version pull request

The manual [Prepare version pull request workflow](../.github/workflows/release-preparation.yml)
creates or updates one draft PR against the repository's default branch. Select
that branch when dispatching it; runs from other branches or tags are skipped.
Concurrent preparation runs are serialized. A local check reads pending Markdown
notes and the official Changesets release plan without contacting a registry.
No notes or no planned package bump means a successful no-op. Notes without a
package bump remain untouched until a later release has a version to prepare.

The workflow installs locked development dependencies and calls the version-only
Changesets action pinned to `ae32849d5ba541f9ae29e40e22a623bc13562f51` (`v2.1.2`).
It runs `npm run release:prepare`, which consumes the pending entries and updates:

- `package.json` and `CHANGELOG.md` through the pinned Changesets CLI;
- the root version fields in `package-lock.json`;
- versions in `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json` and
  `.github/plugin/plugin.json`.

Other manifest fields remain unchanged. The package stays private. This workflow
has only `contents: write` and `pull-requests: write` permissions and contains no
publication action. It does not create tags, GitHub releases, marketplace
submissions or installations. Those remain separately authorized operations.

### Repository prerequisites and review

The repository must permit GitHub Actions to create pull requests under
**Settings > Actions > General > Workflow permissions**. A workflow cannot grant
itself that repository permission; an unavailable setting or policy restriction
requires the documented local preparation path below.

According to the [GitHub workflow-trigger contract](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
PR creation and updates made with `GITHUB_TOKEN` create normal PR workflow runs
in an approval-required state. A maintainer with write access selects
**Approve workflows to run** in the PR banner. Review the generated diff, wait for
checks on its current commit, and mark the draft ready when appropriate. An
updated version PR returns to draft so its new content is reviewed again.

A created PR is not validation evidence. The regular collection, tests, packed
CLI and official Agent Skills checks still apply. Missing or unapproved checks
remain pending. No live dispatch or repository-setting change is required to
test the implementation's fixtures.

## Prepare locally

Use a dedicated branch in an owned, stable checkout with Node.js 24+ and an
explicit `npm ci`. The following command is an intentional local mutation for a
version-preparation task:

```sh
npm run release:prepare
npm run release:verify
git diff --stat
git diff --check
```

The direct forms are `node bin/index.mjs repo prepare-version --project .` and
`node bin/index.mjs repo verify-release --project .`. The explicit project path
selects the repository being prepared. These commands neither install their
dependencies nor publish, commit, push or create a PR. Create the version commit
and PR through the normal repository delivery process after inspecting the diff.

Preparation returns JSON with `version`, `changed` and the number of consumed
`notes`. Repeating it after all notes are consumed succeeds with `changed: false`
and no file changes. The supported input is this single-package repository with
the standard Changesets changelog generator, matching package/lock/plugin
versions, and no active prerelease state. Workspaces and custom commit/changelog
hooks are rejected. The development Changesets dependency is required for
preparation and for verification against a base; it is not bundled into the
consumer CLI's production dependencies.

Both `.changeset/pre.json` and `.changeset/pre` are unsupported, including linked
state. The CLI and workflow reject them before running Changesets, since even
the upstream status operation can migrate legacy prerelease state. Hidden
Markdown, README files and the supported host instruction filenames are left
untouched rather than interpreted as release notes.

The selected project must be an independent package. Package discovery also
rejects a child inside an ancestor workspace, so preparation cannot silently
target files outside the selected project.

Changesets configuration must explicitly set `format: false`. This keeps
generated changelog content reproducible without auto-detecting or executing a
local formatter. Source formatting still uses the normal repository check.

If preparation fails, the adapter restores its captured manifests, pending notes
and changelog. Diagnose the reported error before retrying; do not overwrite
unrelated changes or manually fabricate generated versions. A missing development
dependency requires an explicit `npm ci` in the trusted source checkout.

## Verify a generated version

`npm run release:verify` checks package, lockfile and plugin version alignment
without changing the checkout. After committing a candidate version, compare it
against the full base commit SHA from before preparation:

```sh
npm run release:verify -- --base <full-base-commit-sha>
```

This stronger mode requires a clean tracked worktree and checks that the diff
contains only the generated package/lock/plugin metadata, changelog and removed
pending notes. It recomputes the expected version and complete changelog with the
pinned Changesets CLI from the base commit's notes and existing release history,
then requires an exact match. Missing or altered entries and unrelated edits
hidden inside allowed manifest files fail verification. The comparison uses the
committed changelog after checking worktree cleanliness and file safety, so a
normal Git newline conversion in the checkout does not change release evidence.

Verification requires complete local Git history. A disposable directory reads
existing Git objects at the immutable base to reproduce note commit references,
without sharing the selected checkout's refs, index, configuration or hooks.
Git fetching and formatter execution are disabled. The selected checkout is
read-only and the disposable directory is removed afterward.

The [release-note workflow](../.github/workflows/changesets.yml) first runs normal
Changesets status against the PR base or preceding push commit. When a prepared
version has consumed its notes, the strict verifier must establish that complete
generated-release evidence instead. Branch names, empty note directories and a
version change alone never bypass the check. Failed verification leaves the job
failed; it does not waive other required checks.
