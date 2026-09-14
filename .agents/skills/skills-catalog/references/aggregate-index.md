# Aggregate index contract

## Purpose

An aggregate index combines explicit repository `catalog.json` files for local, cross-collection lookup. It is derived state: every source catalog remains authoritative for its own collection. The index neither discovers directories nor reads package bodies.

## Inputs and bounds

Pass one or more sources as `source-id=catalog-file`. A source ID is the stable lowercase slug selected by the caller; it is the logical collection-root reference retained in the index. The helper reads only the named `catalog.json` file, which must be a bounded regular non-linked file and satisfy catalog schema version 2. It accepts at most 64 sources and 16,384 indexed skills in total.

The generated records retain only the source ID, a logical `source-id/catalog.json` reference, the SHA-256 digest of the catalog bytes, and catalog skill fields. They never retain an absolute source path.

## Storage and formats

The caller selects a local output directory outside every source catalog directory. The helper prefers `skills-aggregate-index.sqlite` when the running Node.js provides built-in `node:sqlite`; otherwise it writes `skills-aggregate-index.json`. Both representations contain the same sorted sources and skills. SQLite supports a compact local query store. JSON is the deterministic, dependency-free fallback and can be moved or inspected as plain text.

The output directory is local derived state, not a source collection. It must not be committed into a collection repository. Deleting an index is safe: rebuild it from the explicit source catalogs.

## Commands

```sh
node "<installed-skill>/scripts/aggregate_index.mjs" rebuild \
  --source "alpha=<alpha-catalog>/catalog.json" \
  --source "beta=<beta-catalog>/catalog.json" \
  --output "<local-index-directory>"

node "<installed-skill>/scripts/aggregate_index.mjs" sync \
  --source "alpha=<alpha-catalog>/catalog.json" \
  --output "<local-index-directory>"

node "<installed-skill>/scripts/aggregate_index.mjs" list \
  --index "<local-index-directory>/skills-aggregate-index.sqlite"
node "<installed-skill>/scripts/aggregate_index.mjs" query \
  --index "<local-index-directory>/skills-aggregate-index.sqlite" \
  --name "skills-discovery"
node "<installed-skill>/scripts/aggregate_index.mjs" query \
  --index "<local-index-directory>/skills-aggregate-index.sqlite" \
  --tag "catalog"
```

Use the filename returned by `rebuild` or `sync`: a host without SQLite produces the JSON filename instead. Pass `--format json` to deliberately choose the portable fallback. `--format sqlite` fails rather than silently changing format when built-in SQLite is unavailable.

## Failure and authority boundaries

The helper rejects duplicate source IDs, malformed catalogs, source links or hard links, oversized input, unsafe index files, output inside a source directory, and invalid query values. It does not scan for more collections, install or activate skills, mutate a source catalog, infer trust from a catalog entry, publish anything, or run setup scripts. A query is only a shortlist; read the selected package's `SKILL.md` before use.
