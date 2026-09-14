# Aggregate skill index

## Objective

Provide a bounded local index that combines the canonical `catalog.json` files of multiple skill collections for cross-collection lookup. Each collection retains its own catalog as the authoritative, versioned inventory.

## Scope

- Add a self-contained helper to `skills-catalog` for rebuilding or synchronizing an aggregate index from explicitly named catalog sources.
- Prefer SQLite through the Node.js built-in `node:sqlite` module, with a deterministic JSON index fallback when that module is unavailable.
- Store source identifier, stable catalog reference, catalog digest, and validated skill records.
- Provide list and query commands for cross-source discovery.
- Add bounded parsing, regular-file checks, malformed-input rejection, tests, documentation, catalog synchronization, and a Changeset.

## Exclusions

- Do not replace any repository `catalog.json`, add a database dependency, scan directories implicitly, install skills, mutate source collections, or access installed skills, user homes, links, or host configuration.
- Do not store absolute local paths in a tracked artifact.
- Do not add a background indexer, telemetry, network access, publication workflow, or MCP server.

## Authority boundaries

This change may read only explicitly supplied source catalogs and write an index only to the caller-selected local output directory. Rebuilding an index does not authorize modifying source collections, installing packages, publishing packages, or merging or releasing this repository.

## Implementation sequence

1. Validate explicit source identifiers and read bounded regular `catalog.json` files.
2. Validate each catalog against the existing catalog contract and derive a deterministic aggregate record set and SHA-256 catalog digest.
3. Write the derived index atomically as `skills-catalog.db` when `node:sqlite` is available, otherwise write `skills-catalog.index.json` as the equivalent JSON representation. Both stay outside source repositories and remain distinct from canonical `catalog.json` files.
4. Read only generated index files for list and exact-name or tag query operations.
5. Add isolated fixtures for valid, malformed, oversized, unsafe, duplicate, fallback, and lookup behavior.
6. Document invocation, output schema, storage boundary, and fallback behavior.

## Validation and acceptance

- `npm run check`
- `git diff --check`
- `npm run changeset:status`
- `npm run ci:official`
- The helper rejects unsafe or malformed sources, writes no source catalog, produces stable output ordering, and returns the same lookup result from SQLite and JSON indexes.

## Rollback

Remove the helper and its documentation in a subsequent reviewed change. Generated aggregate indexes live outside source repositories and can be deleted without changing any canonical catalog.

## Evidence

Retain the implementation diff, isolated test results, catalog synchronization result, Changeset status, and official validator result for the exact review commit.
