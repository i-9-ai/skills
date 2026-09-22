# Aggregate skill index contract

## Purpose

An aggregate index combines explicit repository `skills-catalog.json` files for local, cross-collection lookup and audit history. Every source catalog remains authoritative for its collection's current inventory. The SQLite database is derived for current inventory and synchronization changes, and it is the authoritative local ledger for explicitly recorded skill-evolution operations. The helper neither discovers directories nor reads package bodies.

## Inputs and bounds

Pass one or more sources as `source-id=catalog-file`. A source ID is the stable lowercase slug selected by the caller; it is the logical collection-root reference retained in the index. The helper reads only the named `skills-catalog.json` file, which must be a bounded regular non-linked file and satisfy catalog schema version 1. It accepts at most 64 sources and 16,384 indexed skills in total.

The generated inventory records retain only the source ID, a logical `source-id/skills-catalog.json` reference, the SHA-256 digest of the catalog bytes, and validated catalog skill fields. SQLite history records a canonical UTC observation timestamp, the prior and current source digest and skill count, and normalized before/after skill metadata for additions, changes, and removals. Evolution events retain caller-supplied logical package identities, revisions, file digests, structured state, evidence references, validation summaries, snapshot references, rollback instructions, verified rollback-artifact digests, and an explicit link/worktree map. The helper never stores a source catalog's absolute path, prompt, package body, secret, or telemetry payload. Evolution state may contain caller-local paths because it is a local operational ledger; keep the database outside published repositories.

## Storage and formats

The caller selects a local output directory outside every source catalog directory. The helper writes `skills-catalog.db` when the running Node.js provides built-in `node:sqlite`; otherwise it writes `skills-catalog.index.json`. Both representations contain the same deterministic current sources and skills. `skills-catalog.db` additionally retains local history; the deterministic JSON fallback retains current state only and rejects historical queries. Neither is a replacement for a source collection's canonical `skills-catalog.json`.

The output directory is local state, not a source collection. It must not be inside or committed into a source repository. Catalog and aggregate index formats both use version `1`. SQLite uses an independent ordered database schema version: existing database schema v1 is migrated through v2 event storage and v3 rollback-proof storage before synchronization or event recording, and the migration ledger retains a stable name and checksum for each version. Deleting an index does not change canonical collection bytes, but it discards synchronization history and the authoritative local evolution ledger; archive it before replacement.

## Synchronization and history

`sync` treats the supplied source IDs as the complete current aggregate. It preserves an existing SQLite history, records one observation run, reconciles current source and skill tables, and reports source and skill counts for added, changed, unchanged, and removed states. A repeated unchanged sync records source observations but no skill changes.

Every evolution event references one existing synchronization run. That reference fixes the catalog observation against which the package operation was recorded. Event package identities are immutable values rather than foreign keys to the mutable current skill table, so retirements and source moves remain readable after later synchronizations.

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

node "<installed-skill>/scripts/aggregate_index.mjs" evolution-record \
  --index "<local-index-directory>/skills-catalog.db" \
  --event-file "<caller-workspace>/skill-evolution-event.json"
node "<installed-skill>/scripts/aggregate_index.mjs" evolution-prove \
  --index "<local-index-directory>/skills-catalog.db" \
  --proof-file "<caller-workspace>/legacy-event-rollback-proof.json"
node "<installed-skill>/scripts/aggregate_index.mjs" evolution-events \
  --index "<local-index-directory>/skills-catalog.db" \
  --event-key "2026-09-15:github-issues-merge"
node "<installed-skill>/scripts/aggregate_index.mjs" evolution-events \
  --index "<local-index-directory>/skills-catalog.db" \
  --action "merge" \
  --package "github-issues" \
  --limit "20"
```

`history` returns newest-first synchronization summaries, optionally limited to one source with `--source-id`. `changes` returns newest-first skill changes with normalized `before` and `after` values and accepts optional `--source-id`, `--name`, and `--limit` filters. Limits range from 1 to 1,000. Historical commands require SQLite and fail explicitly for the JSON fallback.

Use the filename returned by `rebuild` or `sync`: a host without SQLite produces the JSON filename instead. Pass `--format json` to deliberately choose the portable fallback. `--format sqlite` fails rather than silently changing format when built-in SQLite is unavailable.

## Evolution event contract

`evolution-record` reads one regular, non-linked JSON file of at most 256 KiB. It applies pending database migrations on a temporary database copy, checks the event and referenced run, inserts the entire operation in one transaction, and atomically replaces the named database only after success. Event keys are immutable and unique; recording the same key again fails without changing database bytes. `evolution-prove` accepts one bounded proof file and can enrich one unproved legacy event exactly once without changing its operation identity or losing prior rows.

Action shapes are explicit:

| Action | Source packages | Target packages |
| --- | ---: | ---: |
| `rename` | 1 | 1 |
| `merge` | 2 or more | 1 |
| `split` | 1 | 2 or more |
| `create` | 0 | 1 or more |
| `retire` | 1 or more | 0 |
| `update` | 1 or more | the same count |
| `relink` | 1 | 1 |

`create` requires a null `before` and object `after`; `retire` requires an object `before` and null `after`; every other action requires both objects. A `validated` event needs at least one passed validation and no failed or blocked validation. A `blocked` event needs at least one failed or blocked validation. Logical package and file paths are relative, cannot contain parent traversal, and cannot enter `.system`.

Event schema version 2 requires `rollback_proof.system_excluded: true`. Its package rows cover every distinct participant with real package bytes or a reverse patch, an artifact SHA-256, and a passed verification observation. Its link/worktree map covers every participating package name and records an explicit host link or an explicit no-link canonical worktree. The helper validates and stores this evidence; it does not execute verification commands or trust artifact claims implicitly.

This complete merge example shows every field:

```json
{
  "schema_version": 2,
  "event_key": "2026-09-15:github-issues-merge",
  "run_id": 12,
  "occurred_at": "2026-09-15T03:00:00.000Z",
  "action": "merge",
  "status": "validated",
  "reason": "Absorb complementary issue triage commands into the canonical package after a no-loss review.",
  "before": {
    "source_packages": 2,
    "target_tree_sha256": "1111111111111111111111111111111111111111111111111111111111111111"
  },
  "after": {
    "source_packages": 1,
    "target_tree_sha256": "2222222222222222222222222222222222222222222222222222222222222222"
  },
  "snapshot_ref": "snapshot:before-evolution-2026-09-14",
  "rollback_instruction": "Restore both source revisions, relink the canonical package, synchronize the catalog, and rerun protected-state checks.",
  "packages": [
    {
      "role": "source",
      "source_id": "global",
      "name": "github-issues",
      "path": "skills/github-issues",
      "revision": "git:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "content_sha256": "1111111111111111111111111111111111111111111111111111111111111111"
    },
    {
      "role": "source",
      "source_id": "global",
      "name": "github-issues",
      "path": "skills/github-issues 2",
      "revision": "upstream:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "content_sha256": "3333333333333333333333333333333333333333333333333333333333333333"
    },
    {
      "role": "target",
      "source_id": "global",
      "name": "github-issues",
      "path": "skills/github-issues",
      "revision": "working-tree:cccccccccccccccccccccccccccccccccccccccc",
      "content_sha256": "2222222222222222222222222222222222222222222222222222222222222222"
    }
  ],
  "files": [
    {
      "path": "skills/github-issues/SKILL.md",
      "before_sha256": "4444444444444444444444444444444444444444444444444444444444444444",
      "after_sha256": "5555555555555555555555555555555555555555555555555555555555555555"
    },
    {
      "path": "skills/github-issues 2/SKILL.md",
      "before_sha256": "6666666666666666666666666666666666666666666666666666666666666666",
      "after_sha256": null
    }
  ],
  "evidence": [
    {
      "kind": "component-matrix",
      "reference": "evidence:github-issues-component-matrix",
      "sha256": "7777777777777777777777777777777777777777777777777777777777777777",
      "note": "Every source section has a keep, adapt, reject, or supersede disposition."
    }
  ],
  "validations": [
    {
      "name": "detached package validation",
      "status": "passed",
      "observed_at": "2026-09-15T03:05:00.000Z",
      "details": "The official validator and package-specific structural checks passed on the recorded target digest."
    }
  ],
  "rollback_proof": {
    "system_excluded": true,
    "packages": [
      {
        "source_id": "global",
        "name": "github-issues",
        "path": "skills/github-issues",
        "method": "package-bytes",
        "artifact_ref": "rollback/0012/packages/github-issues",
        "artifact_sha256": "8888888888888888888888888888888888888888888888888888888888888888",
        "verification_command": "node rollback/0012/verify.mjs",
        "verification_status": "passed",
        "verified_at": "2026-09-15T03:06:00.000Z",
        "verification_details": "Restored package bytes matched the before tree digest in a disposable directory."
      },
      {
        "source_id": "global",
        "name": "github-issues",
        "path": "skills/github-issues 2",
        "method": "package-bytes",
        "artifact_ref": "rollback/0012/packages/github-issues-2",
        "artifact_sha256": "9999999999999999999999999999999999999999999999999999999999999999",
        "verification_command": "node rollback/0012/verify.mjs",
        "verification_status": "passed",
        "verified_at": "2026-09-15T03:06:00.000Z",
        "verification_details": "Restored package bytes matched the before tree digest in a disposable directory."
      }
    ],
    "link_worktree_map": [
      {
        "source_id": "global",
        "name": "github-issues",
        "host_path": "host:global/skills/github-issues",
        "link_target": "repo:i9-skills/.agents/skills/github-issues",
        "canonical_worktree": "repo:i9-skills",
        "canonical_revision": "git:cccccccccccccccccccccccccccccccccccccccc"
      }
    ]
  }
}
```

Use an opaque or caller-local snapshot reference. A snapshot reference alone is insufficient rollback proof, especially when it contains only symlinks. Keep real package bytes or a reverse patch outside discovery roots, verify the artifact digest and restoration behavior, map host links to canonical worktrees and revisions, and exclude `.system` explicitly. Store a specific rollback instruction that selects the affected packages and repeats catalog plus protected-state validation; recording the event never performs rollback.

## Failure and authority boundaries

The helper rejects duplicate source IDs, malformed catalogs, source links or hard links, oversized input, unsafe index files, output inside a source directory, incompatible or altered migration ledgers, implicit history resets, duplicate event keys, missing run references, invalid action shapes, absolute or traversing logical event paths, `.system` paths, incomplete rollback coverage, unverified rollback artifacts, and invalid query values. It does not scan for more collections, validate claimed revisions or evidence, read rollback artifacts, restore snapshots, execute rollback instructions, install or activate skills, mutate a source catalog or package, infer trust from a catalog entry, publish anything, or run setup scripts. A query is only a shortlist; read the selected package's `SKILL.md` before use.
