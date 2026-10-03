# GitHub changelog and consumer availability

## Objective and accepted scope

Improve the reviewed Changesets release flow with GitHub references in future
changelog entries and a bounded anonymous consumer-availability check after
publication. The user approved implementation after comparing the current
configuration with a separate private-package project. Issue #84 owns the
availability follow-up. The existing package remains public; private-package
tagging, release permissions, stable version semantics and historical changelog
bytes remain unchanged.

## Current and target behavior

- Today the default changelog shows short commit identifiers. Adopt the pinned
  official `@changesets/changelog-github` 1.0.1 generator with its standard PR,
  commit and author format. Do not enable experimental templates.
- Correct the editor schema URL from config 3.0.2 to the installed config 4.0.1.
- Today prepared-release verification reproduces the default generator locally.
  Preserve exact full-note regeneration and history comparison for both the
  existing default configuration and the new GitHub configuration. Only explicit
  version preparation may resolve GitHub references. Retain bounded, public
  reference evidence in the version PR so verification never needs a token or
  network. Evidence is reviewable source data, not a signed provider attestation.
- Today an npm upload can succeed before its metadata/tarball is consumable.
  Add an anonymous exact-version check after the official publish action. Check
  registry metadata, download the corresponding bounded tarball, validate its
  declared integrity, and exercise the installed runtime in disposable state
  when appropriate. Timeouts report unavailable consumer delivery; they never
  retry publication or modify release metadata.

## Implementation and ownership

1. Root maintains dependency/config changes, documentation, Changesets, Beads
   reconciliation and integration in this one checkout and feature branch.
2. A changelog implementation agent owns release source adapters and focused
   release tests. Use the actual pinned official generator for both production
   output and offline replay. Reject malformed, incomplete or unrelated evidence;
   preserve rollback on preparation failure, and keep legacy verifier fixtures.
3. An availability implementation agent owns the post-publication script,
   companion guide, workflow wiring and focused tests for #84. It must preserve
   official Changesets/OIDC and use no credentials in registry probes.
4. Run full Node 24 checks and packed-runtime checks. Obtain independent review
   on the exact commit and correct material findings before remote delivery.
5. Use the existing authorized PR/review/merge release process. Version
   preparation is a separate generated PR; never hand-edit CHANGELOG.md or
   publish manually. Verify provider outcomes separately from implementation.

## Instruction map

Current and target chains remain root AGENTS.md -> src/AGENTS.md,
tests/AGENTS.md and plans/AGENTS.md. No new scoped AGENTS.md is needed. Add
one-line navigation entries for the new durable plan and release adapters to
the existing parent indexes. Public contributor guidance remains in the existing
documentation and CLI entrypoint; distributed skill procedures are unchanged.

## Authority boundaries and exclusions

No corporate repository mutations, new domain modules, global skills or hook
installation, marketplace upload, token creation, broad formatter changes,
private-package publication, historical release rewrite or npm republishing.
Tracker writes use the existing local Beads 1.0.5 embedded Dolt store, serialized
by root, with sandbox auto-push disabled. Existing deferred external-module work
stays deferred. New dependency installation is confined to this tooling checkout.

## Validation and acceptance

- Explicit `npm ci` with Node 24, then `npm run check`,
  `npm run package:check`, `npm run changeset:status` and `git diff --check`.
- Synthetic GitHub references demonstrate PR, direct-commit fallback, attribution,
  multiline Markdown and complete history preservation. Verification uses no
  network/credentials and rejects missing/tampered reference evidence and changed
  generated text. Preparation failures restore prior manifests, notes and evidence.
- Availability fixtures cover delayed metadata/tarball, successful integrity,
  wrong identity/version, integrity disagreement, request bounds and timeout.
  Native registry execution is separate provider evidence after a real release.
- PR descriptions explain each material before/after behavior, include #84 and
  distinguish implementation, tests, merged changes and registry availability.
- Close Beads tasks only with exact revision, check results and delivery evidence.

## Rollback

Revert the feature commit to restore the previous generator, schema and workflow
step together. Preserve all previously released history and existing local
evidence. A failed availability probe must not delete or republish the version.
