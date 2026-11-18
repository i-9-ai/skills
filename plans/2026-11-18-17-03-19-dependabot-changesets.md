# Dependabot Changesets

## Objective and scope

Ensure same-repository Dependabot pull requests targeting `main` contain a
Changeset before merging. Add a repository-only workflow, a dependency-free
helper, offline regression tests and release-management guidance. Backfill the
currently open dependency pull requests with the same note policy.

The helper creates a patch note for npm manifest/lockfile updates and an empty
Changeset for GitHub Actions-only updates. Maintainers retain responsibility for
reviewing release intent and dependency compatibility. Preserve existing notes.

## Authority and exclusions

The privileged job reads only the trusted default-branch revision, never checks out or
executes contribution code, installs no dependencies, and uses the repository's
ephemeral token only to read PR metadata and add one Changeset to its branch.
Validate live bot ownership, same-repository identity, base branch, allowed file
paths and exact expected head before writing. No force pushes, merges, release
publication, new credentials, repository settings or consumer installation.

Normal CI remains read-only and required. GitHub may require approval of runs
created by a `GITHUB_TOKEN` commit; document that platform boundary instead of
introducing a stored token or bypassing checks. Unrelated dependency/build
failures remain separately visible.

## Implementation and rollback

1. Add a `workflow_run` follow-up to release-note validation with a manual PR-number backfill input,
   explicit permissions, pinned existing actions and no contribution checkout.
2. Read live metadata and paginated changed files through GitHub's API; preserve
   an existing changed note or create one deterministic note through an atomic
   expected-head commit. Stale events and repeated runs make no changes.
3. Exercise accepted, skipped, rejected and racing cases using synthetic API
   responses. Document policy and invocation; add a Changeset for this change.
4. Run locked installation, repository checks, Changesets status and whitespace
   verification; obtain independent review on the exact commit. Backfill open
   PRs and observe their current checks without merging them.

Revert the new workflow/helper/tests/docs to disable future automation. A note
already committed to a dependency PR can be reviewed or removed independently;
never rewrite the branch's existing commits.

## Acceptance and evidence

- A supported bot PR without a note receives exactly one Changeset at the
  expected head; repeats and existing notes are no-ops.
- Human, fork, wrong-base, stale and unsupported-file requests cannot mutate.
- npm changes request a package patch; Actions-only changes request no release.
- API failures and head races fail visibly without overwriting branch changes.
- `npm ci`, `npm run check`, `npm run changeset:status` and `git diff --check`
  pass. Offline fixtures do not prove hosted event scheduling or CI approval.
- Retain exact-commit independent review and hosted PR/check links in the PR.

## Source confirmation

GitHub documents the restricted Dependabot token, the trusted follow-up use of
`workflow_run`, and approval-required PR runs produced by `GITHUB_TOKEN`:

- https://docs.github.com/en/code-security/reference/supply-chain-security/troubleshoot-dependabot/dependabot-on-actions
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
