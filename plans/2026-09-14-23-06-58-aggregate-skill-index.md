# Aggregate skill index

## Objective

Provide a bounded local index that combines canonical `skills-catalog.json` files for cross-collection lookup and retains local audit history as those source manifests change. Each collection retains its own manifest as the authoritative, versioned inventory.

## Scope

- Migrate the pre-release canonical repository manifest from the generic `catalog.json` name to `skills-catalog.json` across validation, session hooks, documentation, examples, and tests, without an alias or duplicate.
- Add a self-contained helper to `skills-catalog` for rebuilding or synchronizing an aggregate index from explicitly named catalog sources.
- Establish the first public catalog and aggregate-index format as version `1`, with no compatibility branch for unpublished draft formats.
- Prefer SQLite through the Node.js built-in `node:sqlite` module, with a deterministic JSON index fallback when that module is unavailable.
- Store current source identifiers, stable catalog references, catalog digests, and validated skill records.
- On SQLite sync, retain source observations and normalized added, changed, and removed skill states with timestamps and before/after metadata.
- Provide list and query commands for current discovery plus history and change-detail commands for SQLite.
- Add bounded parsing, regular-file checks, malformed-input rejection, tests, documentation, catalog synchronization, and a Changeset.

## Exclusions

- Do not replace `skills-catalog.json` with the derived database, add a database dependency, scan directories implicitly, install skills, mutate source collections, or access installed skills, user homes, links, or host configuration.
- Do not store absolute local paths in a tracked artifact.
- Do not add a background indexer, telemetry, network access, publication workflow, or MCP server.

## Authority boundaries

This change may read only explicitly supplied source catalogs and write an index only to the caller-selected local output directory. Catalog inventory never installs or activates a skill, grants permissions, or runs setup. Rebuilding an index does not authorize modifying source collections, installing packages, publishing packages, or merging or releasing this repository.

## Implementation sequence

1. Migrate every current repository consumer to the explicit `skills-catalog.json` path and remove the old generic path.
2. Validate explicit source identifiers and read bounded regular `skills-catalog.json` files.
3. Validate each catalog against schema version `1` with exactly `name`, `path`, `description`, and `tags` per package, then derive a deterministic current aggregate plus its SHA-256 source digest. Lifecycle evidence remains outside this inventory format.
4. Write `skills-catalog.db` through Node.js built-in SQLite. `sync` preserves prior observations and skill changes transactionally; `rebuild` establishes a baseline and requires an explicit reset before discarding existing history.
5. Write `skills-catalog.index.json` as the deterministic current-state fallback when SQLite is unavailable, and reject history commands rather than implying equivalent retention.
6. Read generated index files for current list and exact-name or tag query operations; expose bounded SQLite history summaries and normalized skill change detail.
7. Add isolated fixtures for valid, malformed, oversized, unsafe, duplicate, fallback, lookup, unchanged sync, source removal, skill addition/change/removal, and reset protection.
8. Document invocation, output schema, storage boundary, retention bounds, privacy exclusions, and fallback limitation.

## Validation and acceptance

- `npm run check`
- `git diff --check`
- `npm run changeset:status`
- `npm run ci:official`
- The helper rejects unsafe or malformed sources, writes no source catalog, produces stable current output ordering, and returns the same current lookup result from SQLite and JSON indexes.
- SQLite `sync` retains distinct observations and exact normalized skill changes without absolute source paths, prompts, package bodies, secrets, or telemetry.
- The JSON fallback stays byte-deterministic for unchanged current state and refuses historical queries.
- Repository validation and the session index consume only `skills-catalog.json`; no `catalog.json` alias remains.
- The catalog and aggregate index both report format version `1`, reject other versions, and contain no manual lifecycle-status field.
- SQLite synchronization retains `sync_runs`, `source_observations`, and `skill_changes`, including timestamps, retention limits, and explicit reset protection.

## Rollback

Remove the helper and its documentation in a subsequent reviewed change. Generated aggregate indexes live outside source repositories and can be deleted without changing any canonical catalog; deleting SQLite also deletes its local audit history. Restore the pre-release manifest name only by reverting the complete consumer migration.

## Evidence

Retain the implementation diff, isolated test results, catalog synchronization result, Changeset status, and official validator result for the exact review commit.
