# Initial npm publication

## Objective and authority

Complete [issue #17](https://github.com/i-9-ai/skills/issues/17) so a consumer can
run `npx @i-9.ai/skills` without a Git specifier or global installation. The
maintainer requested registry distribution, created the `i-9.ai` organization
and authenticated the terminal. Verify publisher identity and scope ownership
before uploading. Existing authorization covers reviewed PR merges and this
initial public npm release; it does not cover account/security changes, directory
submissions, persistent consumer installation or unattended future publication.

## Scope and exclusions

Use the existing Node 24 build, package allowlist and pinned Changesets CLI.
Remove the private-package guard and explicitly select the public npm registry,
public access and `latest` tag. No new dependency or publishing workflow is needed.
Retain the experimental notice and all existing host/runtime limitations.

## Instruction map

Retain `AGENTS.md` for repository authority, `plans/AGENTS.md` for release plans,
`tests/AGENTS.md` for disposable package tests and the indexed public-documentation
guide for docs. Add only this plan's link to the plans index. No child scope,
directory or executable entrypoint is created. Read root -> plans for the plan,
root -> tests for package checks, and root -> public-documentation for public
guidance. Restore the index together with the plan if this preparation is reverted.

## Sequence

1. Verify `npm whoami` and `npm org ls i-9.ai`; keep credentials out of receipts.
2. Review and merge public-access metadata, its packaging assertion, release
   intent and documentation that still identifies registry availability as pending.
3. On a separate dedicated branch, run `npm run release:prepare`. Consume pending
   Changesets into the generated version/changelog and align package, lockfile and
   host-plugin versions. Commit only generated release artifacts. Independently
   review and run `npm run release:verify -- --base <preparation-base-sha>` plus
   normal CI before merging.
4. At the merged release commit, build and pack into a disposable directory,
   inspect the exact allowlisted files and integrity, then publish that tarball
   with `npm publish <tarball> --access public --tag latest --ignore-scripts`.
   Do not rebuild or repack during upload. Retain sanitized hash/registry receipts
   outside the repository. Complete any required account authentication without
   weakening two-factor protection.
5. Verify the registry version/integrity and public access. Use a fresh temporary
   HOME and cache with no npm credentials to run unversioned help, bundled catalog
   retrieval and the MCP stdio handshake. Update ordinary README/docs commands to
   the now-available registry spelling in a follow-up reviewed PR.
6. Close issue #17 and the Beads task only with actual publication and anonymous
   consumer evidence. A successful dry-run or packed test is insufficient.

## Validation and evidence

Run explicit `npm ci`, `npm run check`, `npm run package:check`, Changesets status
and diff checks on Node 24. Require exact-commit independent review, matching
protected-branch CI and the official validator. Generated version verification
must recompute the complete changelog against its immutable preparation base.
Record the published artifact's integrity, version and source commit; never retain
tokens or authentication URLs. Anonymous consumer probes must not modify the
maintainer's installed skills, real HOME or host configuration.

## Recovery

Before publication, revert preparation metadata or the generated-version commit
without changing unrelated work. After publication, a name/version cannot be
reused: fix a defect through a new Changeset and version rather than attempting to
overwrite it. Do not unpublish, deprecate or alter package access without separate
authority. A failed or ambiguous upload requires reading registry metadata before
retrying; do not infer failure solely from a client timeout.
