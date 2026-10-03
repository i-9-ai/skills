# Release management

## Purpose

This repository uses [Changesets](https://github.com/changesets/changesets) to record pending release notes and semantic version intent. It separates contribution review, generated version review and publication: the reviewed version PR's protected merge triggers the authorized npm and GitHub release workflow.

## Normal contribution flow

1. Make and validate the change.
2. Add a Markdown entry under `.changeset/` for a user-visible release change with `npm run changeset`.
3. Review the resulting version intent and release-note wording in the pull request. Reconcile the note against the complete user-visible diff: describe concrete capabilities, commands or interfaces when material, and meaningful limits. Do not use a generic summary when one Changeset represents a broad foundational delivery.
4. Run `npm run changeset:status`; GitHub Actions performs the same read-only validation.
5. Merge the change only through the usual repository review process.

Changesets may be omitted only for changes that have no user-visible release note, such as purely local test-fixture maintenance. Explain that decision in the pull request.

## Automated release flow

The [Release packages workflow](https://github.com/i-9-ai/skills/blob/main/.github/workflows/release.yml)
runs on default-branch pushes and explicit dispatches. A merged contribution with
pending version intent creates or updates a **draft version PR**. After that PR
passes review and protected-branch checks, its merge runs release verification,
repository checks and compiled-package checks, publishes the official packed
artifact to npm, and creates its Git tag and GitHub release from `CHANGELOG.md`.
An independent read-only job then checks anonymous availability of the exact
published npm version and verifies its downloaded tarball integrity.

```mermaid
flowchart LR
    Notes[Contribution and Changeset] --> Main[Reviewed merge to main]
    Main --> Version[Draft aligned version PR]
    Version --> Review[Review and current-head checks]
    Review --> Merge[Protected version merge]
    Merge --> Pack[Verify, test and pack]
    Pack --> Npm[npm Trusted Publishing]
    Npm --> Release[Git tag and generated GitHub release]
    Release --> Availability[Anonymous metadata and tarball integrity]
```

The official Changesets `select-mode`, `version`, `pack` and `publish` actions
are pinned to `ae32849d5ba541f9ae29e40e22a623bc13562f51` (`v2.1.2`) for CLI
`3.0.2`. Preparation uses `npm run release:prepare` to align package, lockfile
and Codex/Claude/Copilot plugin versions. Publication verifies that the release
at the triggering commit reproduces the preceding commit's pending notes;
unrelated changes or fabricated versions fail. The official packed artifact is
passed to the publish action rather than replacing its command or repacking a
different checkout.

No pending notes and no unpublished version is a successful no-op. Notes without
a package bump stay untouched. Linked notes, malformed intent and unsupported
prerelease state are rejected before selecting an action. Runs on other branches
or tags are skipped. Concurrent release runs are serialized.

### GitHub release references

The configured `@changesets/changelog-github` generator is pinned to `1.0.1`.
Its standard format adds links to the associated PR, commit and GitHub author
when available; the Changeset summary remains the release description. A direct
commit can retain a commit link without a PR. Experimental templates are not
enabled. Previous releases remain byte-identical rather than being reformatted.
See the [official generator contract](https://changesets.dev/packages/changelog-github).

Only explicit version preparation resolves references through the GitHub API.
The official version action supplies its existing repository token to that
command. Local preparation requires an existing `GITHUB_TOKEN` environment
value; it does not create a token or silently use another account. API failure
fails preparation and restores the captured release inputs.

Preparation includes `.changeset/github-references.json` in the generated version
PR. This bounded receipt binds the base commit, repository, pinned generator and
public query results. It contains no credentials or request headers. Review its
PR/commit/author references with the generated notes. It is editable public source
evidence, not a signature or independently authenticated provider attestation.

Release verification replays the exact required queries from that committed
receipt through the same pinned official generator. It requires no token or
network and rejects malformed, missing or unused evidence. Full note content,
version intent and historical changelog preservation remain checked.

The editor schema is pinned to `@changesets/config` `4.0.1`, matching the installed
configuration package rather than the independent CLI version. `commit: false`,
`format: false`, public access and base branch `main` remain unchanged.
`privatePackages.tag: false` only affects packages whose `package.json` has
`private: true`; it does not disable tags for this public npm package.

### Publisher and repository prerequisites

Keep default workflow permissions read-only. Enable **Settings > Actions >
General > Allow GitHub Actions to create and approve pull requests** so the
version action can create its PR; the workflow does not approve reviews or merge
PRs. Its version job has only `contents: write` and `pull-requests: write`.
Only its publication job receives `id-token: write`.

Configure npm Trusted Publishing for this exact binding:

| Field | Value |
| --- | --- |
| Package | `@i-9.ai/skills` |
| GitHub owner / repository | `i-9-ai/skills` |
| Workflow filename | `release.yml` |
| Environment | None |
| Allowed operation | `npm publish` |

An authenticated package owner can configure it with npm 12:

```sh
npm trust github @i-9.ai/skills --file release.yml --repo i-9-ai/skills --allow-publish
```

This administrative operation requires the owner's authentication. Do not store
an `NPM_TOKEN` or weaken 2FA. npm exchanges the hosted workflow's OIDC identity
for a short-lived publication credential. The repository selects Node 24;
npm's OIDC minimum is Node 22.14.0 and npm 11.5.1. The publish job uses a
GitHub-hosted runner. The public package and matching
repository metadata allow npm provenance for this supported flow. Tests or a
configured binding do not prove a completed upload. See the
[official npm contract](https://docs.npmjs.com/trusted-publishers/).

Before invoking the official publish action, a CI-only prerequisite helper checks
the Node/npm versions, public manifest registry and repository, exact default
branch workflow identity, and presence of the job's OIDC request variables.
It rejects a stored publication-token fallback and never requests or prints a
token. Its `server_binding_verified: false` result deliberately records that
these local checks cannot inspect the npm package's configured publisher.
The helper's success is prerequisite evidence, not authentication or publication.

[Run 36925711979](https://github.com/i-9-ai/skills/actions/runs/36925711979)
failed to upload `0.2.0` with `ENEEDAUTH` at commit
`c5a981b947b934252ee3ac3b942828e62a71b72d`, despite Node `24.21.0` and npm
`11.19.0` meeting the supported runtime. For this error, verify the exact
case-sensitive owner, repository, workflow filename, optional environment and
`npm publish` permission in the authenticated npm settings before retrying.
The binding is not validated when saved. Do not infer a successful binding from
runtime checks or replace it with a stored token. Check the registry version
before retrying an ambiguous upload and retain the retry's actual result.

The owner configured that exact publisher on 2026-10-01. The same run's retry
then published `@i-9.ai/skills@0.2.0` through OIDC and created the
[GitHub release](https://github.com/i-9-ai/skills/releases/tag/v0.2.0).
An anonymous fresh-cache consumer independently retrieved that registry version
and executed `catalog overview` on Node `24.21.0`. This verifies the completed
workflow and CLI distribution for that release; later versions still require
their own publication and consumer evidence.

According to the [GitHub trigger contract](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
PR creation and updates with `GITHUB_TOKEN` create PR checks in an
approval-required state. A maintainer with write access selects **Approve
workflows to run** in the PR banner. Review the generated diff, wait for checks
on its current commit, and mark the draft ready when appropriate. An updated
version PR returns to draft so its new content is reviewed again. No stored
GitHub App or personal token is required for this approval path.

### Verify publication and recover a failure

The post-publication availability job receives neither npm publication credentials
nor OIDC permission. It verifies the exact name/version reported by the official
publish action against the reviewed manifest, fetches public registry metadata,
and downloads the matching tarball to compare its advertised integrity. Bounded
retries allow metadata and tarball visibility to catch up with a successful upload.
The probe allows up to 15 minutes overall, 15 seconds per request including its
body, and 91 attempts with 10-second waits. Metadata is limited to 512 KiB and
compressed tarballs to 64 MiB. The job timeout is 20 minutes.
Timeout or integrity disagreement fails the availability check; it never
republishes, changes versions/tags, or requests credentials to recover.

This automated check proves artifact retrieval and integrity, not installed CLI
or MCP behavior. Keep the separate disposable runtime verification below when
confirming a release. Publication may already have succeeded when availability
fails; inspect the registry before choosing any recovery action.
The repository's
[availability probe guide](https://github.com/i-9-ai/skills/blob/main/.github/scripts/package-availability.md)
documents exact inputs, observations and failure boundaries.

Inspect the workflow result, registry version, `latest`, integrity, version tag
target and generated GitHub release. Exercise `npx --yes @i-9.ai/skills --help`,
catalog retrieval and the stdio MCP handshake from a disposable anonymous
consumer with fresh HOME/cache and no publisher credentials. Keep sanitized
commit, artifact and consumer receipts outside the checkout. Initial distribution
and consumer evidence are recorded in
[issue #17](https://github.com/i-9-ai/skills/issues/17).

A published name/version cannot be overwritten. Correct it with a new Changeset
and version. Check registry state before retrying an ambiguous upload.
Changesets skips versions already present in npm, so a retry after a successful
upload does not automatically recover a missing GitHub tag/release. Never move
an existing version tag. For a tag without its release, verify its target and
recover the release from that version's generated changelog separately, without
re-uploading npm. Unpublishing, deprecation, marketplace submission and consumer
installation remain separately authorized operations.

### Restore the original 0.1.0 GitHub release

The first npm upload preceded this integrated automation. The explicit
`backfill-0.1.0` dispatch restores only its missing GitHub metadata:

```sh
gh workflow run release.yml --ref main -f operation=backfill-0.1.0
```

The job checks out reviewed source commit
`468de535b715c817a1eda72682f15f9e55e52fdc`, verifies aligned versions and no
pending notes, then runs the official CLI `git-tag` through the pinned root
Changesets action. Git CLI push preserves that historical target; the ordinary
action API path would use the newer workflow commit. The job has only
`contents: write`, no npm upload command and no OIDC publication permission.
It creates `v0.1.0` and the release from its original generated changelog.
A verified existing tag/release makes a rerun a no-op. An existing tag without
a release fails for explicit recovery rather than moving it or re-uploading npm.

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
either the standard Changesets changelog generator or the pinned GitHub generator
with its declared repository, matching package/lock/plugin versions, and no active
prerelease state. Workspaces and arbitrary commit/changelog hooks are rejected.
The development Changesets dependencies are required for
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
Preparation removes whitespace-only indentation from new release entries and
strict verification reproduces that same canonical output. This normalization
leaves existing release history and generated nonblank Markdown and code
indentation unchanged.

If preparation fails, the adapter restores its captured manifests, pending notes,
changelog and reference receipt. Diagnose the reported error before retrying; do not overwrite
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
contains only the generated package/lock/plugin metadata, changelog, GitHub
reference receipt when applicable, and removed pending notes. It recomputes the expected version and complete changelog with the
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

The [release-note workflow](https://github.com/i-9-ai/skills/blob/main/.github/workflows/changesets.yml) first runs normal
Changesets status against the PR base or preceding push commit. When a prepared
version has consumed its notes, the strict verifier must establish that complete
generated-release evidence instead. Branch names, empty note directories and a
version change alone never bypass the check. Failed verification leaves the job
failed; it does not waive other required checks.
