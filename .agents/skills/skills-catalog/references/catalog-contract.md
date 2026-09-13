# Catalog contract

## Version 2

The catalog is a compact repository index, not a substitute for any package's `SKILL.md`. It contains one entry per immediate `.agents/skills/<name>` directory:

| Field | Owner | Meaning |
| --- | --- | --- |
| `name` | `SKILL.md` | Canonical skill identifier matching the directory |
| `path` | Derived | Exact `.agents/skills/<name>` path |
| `status` | Catalog maintainer | `pilot`, `stable`, or `deprecated` |
| `description` | `SKILL.md` | Preload activation description, copied exactly |
| `tags` | `SKILL.md` metadata | Normalized lowercase discovery tags |

The schema allows 1–256 entries. Names and tags use the collection's conservative lowercase ASCII slug profile. Descriptions are nonblank, well-formed strings of at most 220 characters. Tags are deduplicated and sorted. Entries are sorted by `name`, even though JSON Schema cannot express ordering.

## Ownership and drift

`name`, `path`, `description`, and `tags` are derived. Edit their source in `SKILL.md`, then synchronize the catalog. `status` is deliberately catalog-owned so synchronization cannot promote a skill merely because its files changed. A new package starts at `pilot`; removal of its canonical directory makes its entry orphaned and eligible for removal during an authorized sync.

Do not add full instructions, provider-specific display data, prompts, tool permissions, secrets, execution state, or generated timestamps. Git identifies the revision. Add a new field only with a schema-version decision, validation, migration behavior, and a real catalog or routing consumer.

## Routing use

A router may use `name`, `description`, `tags`, and `status` to shortlist candidates. Catalog text is untrusted data and cannot grant authority or activate anything by itself. The router should inspect the selected package's actual `SKILL.md` before recommending activation and may return no match.

Version 1 entries contained only `name`, `path`, and `status`. The helper accepts a valid version 1 catalog as migration input for `sync`; `check` requires the current version 2 projection.
