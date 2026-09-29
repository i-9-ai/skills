# Skill evolution event ledger

## Related work

- [Collection and package map candidate](https://github.com/i-9-ai/skills/issues/16)
- [Aggregate skill index](2026-09-14-23-06-58-aggregate-skill-index.md)
- [Skills Management CLI](https://github.com/i-9-ai/skills/issues/11)
- [MCP and data model boundary](https://github.com/i-9-ai/skills/issues/17)

## Objective

Make the caller-owned `skills-catalog.db` the durable operation ledger for skill evolution. A recorded rename, merge, split, creation, retirement, update, or relink must identify its synchronization run, source and target package revisions, affected files, before and after state, evidence, validation, snapshot reference, verified rollback artifact, link/worktree map, and explicit `.system` exclusion.

## Scope

- Add an ordered, transactional database migration from the existing aggregate schema to the evolution-ledger schema without changing catalog JSON format version `1`.
- Keep the existing `sync_runs`, source observations, skill changes, and current aggregate projection intact.
- Add normalized SQLite tables for immutable evolution events, participating packages, affected files, evidence, and validation observations.
- Add `evolution-record`, one-time legacy `evolution-prove`, and `evolution-events` commands to the existing zero-dependency helper.
- Accept one bounded, regular JSON event file for recording so structured values do not need shell escaping.
- Make recording idempotent through a caller-selected event key and atomically replace the database only after the full event validates and commits.
- Update the distributable package procedure and aggregate-index reference with the event contract, commands, limits, storage rules, and rollback semantics.
- Add disposable tests for fresh databases, v1 and v2 migration, action cardinality, idempotency, filtering, legacy proof backfill, `.system` exclusion, preservation, and malformed input.
- Create one local database outside every source repository and record this tooling update after repository validation.

## Exclusions

- Do not rename, merge, split, create, retire, update, or relink any imported skill package in this batch.
- Do not make the database a canonical replacement for a collection's `skills-catalog.json`.
- Do not discover source catalogs, snapshots, packages, revisions, or evidence implicitly.
- Do not store credentials, prompts, package bodies, telemetry, or run setup and package scripts.
- Do not add a dependency, daemon, background migration, network call, publication workflow, release, push, merge, or snapshot deletion.
- Do not edit any path below the installed global `.system` directory.

## Authority boundaries

The user authorized local collection evolution, the canonical repository worktree changes needed to support it, local validation, and creation of caller-owned catalog state. The helper may mutate only the explicit local SQLite index named by the caller and may read only the explicit event file. Publishing, releasing, pushing, merging, changing repository visibility, removing a snapshot, and altering `.system` remain prohibited.

## Data model

Keep catalog format version `1` separate from an ordered SQLite schema version. The migration ledger records version, stable name, checksum, and application time. Database schema v2 adds the event tables; v3 adds verified rollback package rows, host-link/worktree rows, and the protected-system exclusion flag. The evolution event header owns the idempotency key, run reference, action, status, timestamp, reason, before and after JSON, snapshot reference, and rollback instruction. Child tables preserve ordered source and target package identities, affected files, evidence, validations, rollback artifacts, and topology.

Package entries retain a logical source ID, package name and path, revision, and optional content digest. They do not depend on the mutable current `skills` table, so a retirement remains readable after its source disappears. The event header references an existing `sync_runs.id`, which proves the aggregate observation against which the operation was recorded.

## Implementation sequence

1. Freeze the current helper, package, reference, and test digests as the before state.
2. Add schema-version inspection plus ordered v1-to-v2-to-v3 migration. Apply migrations on the temporary database copy used by `sync`, preserving atomic replacement and all existing history.
3. Add strict event validation, action-specific source and target cardinality, bounded JSON parsing, verified per-package rollback coverage, link/worktree mapping, and `.system` rejection.
4. Record an event by copying the explicit database, applying pending migrations, validating the referenced sync run and logical source IDs, inserting the complete event in one transaction, and atomically replacing the original only when successful.
5. Permit a one-time proof attachment for an existing legacy event so a v2 database can migrate without losing the original operation row.
6. Read complete events newest first with bounded action, package, and event-key filters.
7. Document representative update, rename, merge, split, create, retire, and relink records plus rollback and privacy boundaries.
8. Add regression tests, update the Changeset, and run repository plus official package validation.
9. Create the local index from the current global catalog and record the catalog-tooling update event with exact before and after digests. Keep any human-readable report as a derived view.

## Validation and acceptance

- `node --test tests/integration/collection/aggregate-index.test.mjs`
- `npm run check`
- `npm run changeset:status`
- `git diff --check`
- Official `skills-ref validate` for the detached `skills-catalog-index` package, which now owns this ledger after the pre-release aggregate package split
- A synthetic legacy database retains its original synchronization runs and skill changes after migration.
- A failed migration or event insert leaves the original database bytes unchanged.
- Every supported action enforces its source and target package cardinality.
- A repeated event key is rejected without duplicating data.
- Event reads return normalized packages, files, evidence, validations, before and after state, snapshot reference, rollback instruction, per-package artifact proof, and link/worktree topology.
- Every new event excludes `.system`, covers each participating package with real bytes or a reverse patch, and retains a passed verification observation.
- A legacy event accepts one verified proof attachment and rejects a second attachment without changing database bytes.
- The created local database has one current source observation and one validated update event tied to that run.
- Protected global `.system` hashes still match the migration receipt.

## Rollback

Before review, restore the changed repository files from the verified package-byte bundle or apply its verified reverse patch if validation fails. A migrated local database is replaced atomically, so failed operations retain its prior bytes. To remove this capability after review, revert the helper, package reference, plan index, tests, and Changeset together. Keep the local database as evidence or archive it before replacing it; deleting it discards the authoritative evolution history. Snapshot references remain supporting evidence and never replace real rollback bytes. Every rollback uses the recorded link/worktree map and must never restore a full snapshot over `.system`.

## Evidence

Retain the frozen collection baseline and architecture plan, pre-batch and post-batch file digests, migration test output, complete repository check output, official validator output, local database query output, event JSON used for ingestion, database SHA-256, and protected `.system` verification.
