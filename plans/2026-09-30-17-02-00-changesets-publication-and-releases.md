# Changesets publication and GitHub release automation

## Objective

Complete [issue #66](https://github.com/i-9-ai/skills/issues/66): a merged contribution prepares a draft version PR; merging that reviewed PR publishes the compiled npm package and creates its Git tag and GitHub release from the generated changelog. Restore the missing GitHub metadata for the already-published `0.1.0` without uploading it again.

## Scope and authority

The maintainer explicitly requested the standard merge-to-release flow, npm publication, and the missing GitHub release. Replace the version-only workflow with the official Changesets 3-compatible select-mode, version, pack and publish actions. Use the existing version adapter to align the package, lockfile and three plugin manifests. Bind npm Trusted Publishing to this repository and `release.yml`, allowing direct publication; do not introduce an npm token or weaken account authentication. Enable Actions PR creation with read-only default permissions. Protected version PRs still require review and current-head checks; bot-created checks may require a maintainer's approval in GitHub.

No source visibility change, marketplace submission, consumer installation, website deployment, credential creation, package deletion, deprecation or overwrite is included. The promotion website remains a separate unmerged delivery.

## Implementation sequence

1. Preserve the bounded local note preflight and actual Changesets plan checks, including unsupported prerelease state, linked notes, malformed intent and empty-note no-ops.
2. Add default-branch-only `push` and explicit dispatch entry points. Install locked dependencies; keep credentials out of checkout configuration. Grant only the publication job `id-token: write`.
3. Keep version generation in a draft PR. On publication, verify the generated release against the preceding commit, run repository and packaging checks, then pass the official packed artifact to the official publication action without replacing its publish script.
4. Provide one explicit `backfill-0.1.0` dispatch. Check out `468de535b715c817a1eda72682f15f9e55e52fdc` and run the pinned root action with the official CLI `git-tag` command and Git CLI tag push. This preserves the historical tag target rather than using the workflow's newer commit. This job has no npm publication or OIDC authority.
5. Update public instructions and add a patch Changeset. Verify synthetic workflow contracts and real local planner rejection cases, then obtain independent review at the exact commit and current-head CI before merge.
6. Configure and verify the scoped npm publisher, dispatch the historical backfill, and inspect the tag target and release body. Verify a future standard publication through the reviewed version PR and an anonymous CLI/catalog/MCP consumer. Close the Beads task only with provider evidence.

## Validation and evidence

Run explicit `npm ci`, `npm run check`, `npm run package:check`, `npm run changeset:status` and `git diff --check` with Node 24+. Workflow tests parse the actual YAML, execute local preflight/planner snippets against disposable packages, and assert event/ref restrictions, artifact handoff, OIDC separation and the fixed backfill target. They never access real credentials, HOME or npm/GitHub APIs.

Review public upstream implementations at Changesets action `ae32849d5ba541f9ae29e40e22a623bc13562f51` (`v2.1.2`), especially `src/select-mode/index.ts`, `src/pack/index.ts`, `src/run.ts`, `src/github.ts`, and the subaction input contracts. Keep the existing CLI `3.0.2`. Use reviewed Node 24 action pins: checkout `3d3c42e5aac5ba805825da76410c181273ba90b1` and setup-node `820762786026740c76f36085b0efc47a31fe5020`. Follow the [official automation guide](https://changesets.dev/guide/automating), [npm publisher contract](https://docs.npmjs.com/trusted-publishers/) and [GitHub trigger contract](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Retain the candidate SHA, review, CI run IDs, npm publisher binding without secrets, npm version/integrity, anonymous consumer receipt, tag target and GitHub release URL outside tracked source. Structural tests are distinct from live OIDC publication evidence.

## Rollback and recovery

Disable the release workflow or revert it through a reviewed PR to stop future publication. Revoke only this npm trusted-publisher binding when removing the integration. Published versions remain immutable; use a new Changeset for corrections. Check registry state before retrying an ambiguous upload. Never move an existing version tag. If a tag exists without its release, the official tagging command emits no new event: recover the release separately from the verified tag and generated changelog, without re-uploading npm. A rerun after a successful historical backfill is a no-op.
