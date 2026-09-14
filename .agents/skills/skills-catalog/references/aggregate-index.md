# Aggregate index contract

## Purpose

An aggregate index combines explicit repository `skills-catalog.json` files for local, cross-collection lookup and audit history. It is derived state: every source catalog remains authoritative for its own collection. The index neither discovers directories nor reads package bodies.

## Inputs and bounds

Pass one or more sources as `source-id=catalog-file`. A source ID is the stable lowercase slug selected by the caller; it is the logical collection-root reference retained in the index. The helper reads only the named `skills-catalog.json` file, which must be a bounded regular non-linked file and satisfy catalog schema version 2. It accepts at most 64 sources and 16,384 indexed skills in total.

The generated records retain only the source ID, a logical `source-id/skills-catalog.json` reference, the SHA-256 digest of the catalog bytes, and validated catalog skill fields. SQLite history records a canonical UTC observation timestamp, the prior and current source digest and skill count, and normalized before/after skill metadata for additions, changes, and removals. It never retains an absolute source path, prompt, package body, secret, or telemetry payload.

## Storage and formats

The caller selects a local output directory outside every source catalog directory. The helper writes `skills-catalog.db` when the running Node.js provides built-in `node:sqlite`; otherwise it writes `skills-catalog.index.json`. Both representations contain the same deterministic current sources and skills. `skills-catalog.db` additionally retains local history; the deterministic JSON fallback retains current state only and rejects historical queries. Neither is a replacement for a source collection's canonical `skills-catalog.json`.

The output directory is local derived state, not a source collection. It must not be inside or committed into a source repository. Deleting an index is safe for canonical collection state, but it discards the local cross-collection audit history.

## Synchronization and history

`sync` treats the supplied source IDs as the complete current aggregate. It preserves an existing SQLite history, records one observation run, reconciles current source and skill tables, and reports source and skill counts for added, changed, unchanged, and removed states. A repeated unchanged sync records source observations but no skill changes.

`rebuild` establishes a new baseline in a new output. It refuses to replace an existing SQLite history unless the caller supplies `--reset-history`; that explicit reset retains only the new baseline. The helper supports at most 4,096 observation runs and 262,144 skill changes and fails without pruning when a bound is reached. Archive the database or explicitly rebuild it before continuing.

## Commands

```sh
node "<installed-skill>/scripts/aggregate_index.mjs" rebuild \
  --source "alpha=<alpha-catalog>/skills-catalog.json" \
  --source "beta=<beta-catalog>/skills-catalog.json" \
  --output "<local-index-directory>"

node "<installed-skill>/scripts/aggregate_index.mjs" sync \
  --source "alpha=<alpha-catalog>/skills-catalog.json" \
  --output "<local-index-directory>"

node "<installed-skill>/scripts/aggregate_index.mjs" list \
  --index "<local-index-directory>/skills-catalog.db"
node "<installed-skill>/scripts/aggregate_index.mjs" query \
  --index "<local-index-directory>/skills-catalog.db" \
  --name "skills-discovery"
node "<installed-skill>/scripts/aggregate_index.mjs" query \
  --index "<local-index-directory>/skills-catalog.db" \
  --tag "catalog"
node "<installed-skill>/scripts/aggregate_index.mjs" history \
  --index "<local-index-directory>/skills-catalog.db" \
  --source-id "alpha" \
  --limit "20"
node "<installed-skill>/scripts/aggregate_index.mjs" changes \
  --index "<local-index-directory>/skills-catalog.db" \
  --source-id "alpha" \
  --name "skills-discovery" \
  --limit "50"
```

`history` returns newest-first synchronization summaries, optionally limited to one source with `--source-id`. `changes` returns newest-first skill changes with normalized `before` and `after` values and accepts optional `--source-id`, `--name`, and `--limit` filters. Limits range from 1 to 1,000. Historical commands require SQLite and fail explicitly for the JSON fallback.

Use the filename returned by `rebuild` or `sync`: a host without SQLite produces the JSON filename instead. Pass `--format json` to deliberately choose the portable fallback. `--format sqlite` fails rather than silently changing format when built-in SQLite is unavailable.

## Failure and authority boundaries

The helper rejects duplicate source IDs, malformed catalogs, source links or hard links, oversized input, unsafe index files, output inside a source directory, incompatible SQLite schemas, implicit history resets, and invalid query values. It does not scan for more collections, install or activate skills, mutate a source catalog, infer trust from a catalog entry, publish anything, or run setup scripts. A query is only a shortlist; read the selected package's `SKILL.md` before use.
