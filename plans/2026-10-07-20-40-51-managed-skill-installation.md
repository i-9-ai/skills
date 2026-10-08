# Managed collection installation

Source issue: [#101](https://github.com/i-9-ai/skills/issues/101).

## Outcome and interface

Add `skills install`, `skills upgrade`, `skills status`, `skills uninstall` and
`skills recover` to the single CLI. A project scope defaults to the caller's
working directory; `--global` selects the shared agent state root. Writes require
`--write`. JSON previews describe additions, replacements, removals, collisions
and recovery before changing anything. Repeating a completed operation is a no-op.

The running toolkit supplies the bundle. A newer `npx @i-9.ai/skills` invocation
supplies a newer bundle; the commands never update their own executable, fetch
arbitrary packages, run package setup, or publish a release.

## Ownership and recovery

Install actual package directories under the selected `.agents/skills` root.
Keep closed, bounded receipts and transaction preimages under the separate
`installation/i9-skills` state directory. Verify complete package inventories
before replacement or removal. Unmanaged collisions, local edits, changed
receipts, linked/special files, overlapping source/destination and an unfinished
transaction block ordinary writes. Every transaction stages the new bundle,
retains owned preimages, then publishes its receipt. Failures retain a journal;
`skills recover --write` restores only verified transaction bytes. Never delete
the collection root, user evidence, unrelated packages or host configuration.

## Host routing

Offer skills-only or native-plugin installation and detect available client
executables without launching them during preview. Codex's verified CLI surface
installs user-scoped plugins; do not silently widen project scope. Native
Codex/Claude adapters must preflight supported commands and existing ownership,
return explicit manual steps when a client/contract cannot be verified, and
preserve native host settings. A plugin selection must not create loose copies
of the same collection. Hooks/MCP are declared plugin components, not an implicit
skills-only setup. Native install/status/update/removal evidence stays separate
from local filesystem validation and the existing issue90 native pilot.

The shared ownership lock rechecks backend exclusion before dispatch. Native
recovery remains manual when a native pending record exists, including a stale
shared lock. Every mutating native command/flag is probed before starting the
batch. Disabled owned plugins stay disabled. Admission compares the installed
catalog and every package with the running bundle; the receipt records a requested
revision without claiming the host's actual immutable Git revision or activation.

The selected project must exist before managed descendants are created. Removal
uses owned receipts independently of current bundle admission. Broken native
caches produce status conflicts while malformed receipts remain rejected.
Claude refresh uses the documented marketplace-update command at the existing
pin; neither verified native client can replace a registered pin through repeat
add. A source change therefore returns
manual guidance before dispatch, preserving shared registrations and data rather
than removing/re-adding a marketplace or inventing a settings writer.

Retain closed marketplace ownership separately from plugin/cache ownership so
uninstall/reinstall remains convergent without adopting unowned registrations.
Claude removal requires the supported keep-data flag. Native absence is explicit.
Windows detection follows PATHEXT; execution stays shell-free, with batch/script
launchers explicitly manual. Recovery uses retained candidate/withdrawn evidence
to reject an ambiguously deleted published replacement before restoring anything.

## Implementation sequence

1. Add typed configuration and closed receipt/transaction validation.
2. Add bounded source/destination repositories and recovery, with meaningful
   interruption, conflict, path and idempotence tests.
3. Add focused services and command adapters through the existing route registry.
4. Add host routing and supported native adapters or verified manual fallback.
5. Document source identity, selected scope, all commands, migration from unmanaged
   installations and failure recovery. Add a concrete Changeset.
6. Verify source tests and the actual compiled npm tarball using disposable
   fixtures/fake host executors, then obtain independent exact-commit review.

## Acceptance, authority and rollback

The issue's seven acceptance criteria remain the delivery checklist. Run explicit
`npm ci`, Node24 `npm run check`, `npm run package:check`, Changeset status and
`git diff --check`; required official CI must match the reviewed head.

Implementation/testing does not authorize installation into this user's real
profile, global host changes, native downloads, release94, or publishing. No
material dependency is added. Revert the focused CLI change to remove the new
surface; preserve existing receipts and recovery data. Filesystem checks assume
a stable caller-owned environment and do not claim hostile-race-proof confinement.
