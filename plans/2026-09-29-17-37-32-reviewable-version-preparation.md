# Reviewable version preparation

## Objective and authority

Complete [issue #19](https://github.com/i-9-ai/skills/issues/19) with a repeatable,
manually initiated version PR. Changesets remains the semantic-version/changelog
engine. This adds a distinct workflow to the original adoption plan; it does not
authorize npm publication, tags, GitHub releases, visibility changes, marketplace
submission, consumer installation or merging the generated PR.

## Scope and evidence

- Reuse installed `@changesets/cli@3.0.2`; add no second versioning library.
- A synthetic probe confirmed that its `version` command leaves package-lock
  metadata unchanged, and exits nonzero when repeated without pending notes.
- Add `repo prepare-version --project PATH` to run the pinned development CLI,
  synchronize root lockfile and Codex/Claude/Copilot plugin versions, and return a
  successful no-op when no notes remain. Preserve all other manifest fields.
- Add `repo verify-release --project PATH [--base SHA]`. Without a base, check
  version alignment. With a base, also verify an exclusive generated-artifact
  diff, consumed notes, and the complete changelog and version computed by
  Changesets from the base's pending notes and existing history in a disposable
  fixture. Branch
  names alone must never bypass pending-note validation.
- Preparation supports this single-package, standard-changelog configuration.
  Reject workspaces, prerelease-state files and custom commit/changelog hooks
  before writing. Snapshot the known mutable files and restore them if local
  preparation fails. Do not install dependencies or invoke a registry.
- Check Changesets' own package discovery before invoking its version command:
  a selected child package can otherwise resolve to an ancestor monorepo. Use
  the locked CLI's existing `@manypkg/get-packages` dependency to require the
  exact independent root, without introducing another dependency or duplicating
  workspace-discovery rules.
- Reject both `.changeset/pre.json` and `.changeset/pre`, including linked state,
  before running any Changesets operation. The pinned reader consumes nested
  prerelease notes, and even `status` migrates legacy prerelease state. Reuse the
  same bounded repository preflight in the workflow before computing a plan.
  Match the official reader's exclusions for hidden Markdown, case-insensitive
  README and host instruction files so those files are never treated as notes.
- Require explicit `format: false` in Changesets configuration. Its default
  formatter auto-detection can execute a package-manager command and depends on
  local tooling; generated release artifacts must instead be reproducible with
  the pinned engine alone. Normal source formatting remains a separate check.
- Reconstruct the expected changelog with an isolated temporary Git directory,
  detached at the immutable base and reading the existing object store through
  an alternate. Copy only bounded package, configuration, notes and changelog
  inputs. Do not share the working tree, index, refs, configuration or hooks.
  Disable Git transports and lazy fetching, and reject shallow history rather
  than letting Changesets deepen it. Compare all generated changelog bytes so
  altered summaries or removed historical releases cannot pass verification.
- Link the README to canonical version metadata instead of maintaining a
  second literal version that could become stale in a generated release PR.

## Workflow and review

Use the official version-only Changesets action at the verified `v2.1.2` commit
`ae32849d5ba541f9ae29e40e22a623bc13562f51`, after verifying that revision's inputs.
The action's version subcommand creates or updates a draft PR; no publish action
or publish script is present. Trigger only by `workflow_dispatch` on the default
branch, serialize runs, and grant only contents/PR write access. A no-note run
must succeed without creating another PR.

The reviewed `select-mode` action also computes a publication plan, queries the
registry and uploads an artifact when no notes are pending. Keep it outside this
preparation-only workflow. A bounded local listing of `.changeset/*.md`, excluding
`README.md`, decides whether to query the official local Changesets status command.
Read its full pending release plan without `--since` and invoke the version-only
action only when it contains a major, minor or patch release. An empty listing or
notes containing no package bump reports a successful no-op without a registry
query. Empty-note-only input stays untouched for a later real release rather
than creating a version PR with no version change.

Current GitHub documentation permits `opened`, `synchronize` and `reopened` PR
events caused by `GITHUB_TOKEN`, but their workflow runs require human approval
from the PR's **Approve workflows to run** banner. Retain normal validation
triggers and document that approval, the draft review step and the repository's
permission to let Actions create PRs. A later preparation update returns the PR
to draft. Do not add secrets or change repository settings. Missing checks remain
pending; a generated PR is never considered verified merely because it exists.

Normal Changesets validation still requires a pending note. When notes were
consumed by a version PR or its merge, the strict generated-release verifier may
accept the equivalent release evidence instead. Full collection, tests, package
and official validation remain required.

## Structure and implementation

1. Keep commands focused on input/output; add a cohesive release service and a
   filesystem/process repository under existing singular source scopes.
2. Validate inputs before invoking Changesets; keep the normal source/package
   loader unchanged. The development dependency is required only when preparing
   or recomputing a release, with an explicit diagnostic if absent.
3. Wire npm scripts, manual version workflow, required-check event handling,
   release/public documentation, child indexes and a Changeset.
4. Test successful generation, preserved metadata, lock/plugin alignment,
   repeat preparation, absent dependencies, rollback, and rejection of unrelated
   changes or fabricated version evidence using disposable fixtures.

### Instruction map

Retain the existing `AGENTS.md` -> `src/AGENTS.md` -> `src/command/AGENTS.md`
reading route. The source contract continues to own layers, the command contract
owns input/output adapters, and `bin/index.md` remains the shared operator guide.
Add release service/repository/validator and command links to those existing
indexes; do not create a release-specific instruction scope. Public documentation
continues through the root contract and its indexed public-documentation guide.
The `plans/AGENTS.md` entry owns this workflow decision. Validate all new links and
restore these index changes with the implementation if the feature is reverted.

## Validation and limits

Run `npm run check`, then `npm run package:check`, Changesets status and whitespace
checks; obtain independent review on the exact commit and matching GitHub CI.
All new tests use synthetic repositories and local pinned dependencies. Do not
prepare a real release or dispatch the writing workflow as part of this PR.
Offline workflow/configuration tests are not evidence that repository settings
permit live bot PR creation; retain that distinction in the operator guide.

## Rollback

Revert this coherent change to restore the former local Changesets command and
read-only workflow. No release is published, no task database is migrated, and
no consumer configuration is written. A generated version PR remains a separate
reviewable change and must not be silently merged or discarded.

Sources: [Changesets action v2.1.2](https://github.com/changesets/action/tree/v2.1.2),
[version action](https://github.com/changesets/action/tree/v2.1.2/version), and the
installed Changesets 3.0.2 CLI source. The
[GitHub workflow-trigger contract](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
supersedes the older assumption that bot-created PRs cannot trigger checks.
Reviewed 2026-09-29; no upstream code copied.
