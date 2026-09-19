# Catalog contract

The canonical repository manifest is `<collection-root>/skills-catalog.json`. The explicit domain name distinguishes this inventory from unrelated product, data, or plugin catalogs. Before the first release, migrate every consumer to that path rather than retaining aliases or parallel manifest copies.

## Layouts

The helper requires one explicit collection root and supports two layouts:

| Layout | Input | Catalog path projection |
| --- | --- | --- |
| `repository` | Immediate packages in `<root>/.agents/skills` | `.agents/skills/<name>` |
| `global` | Real packages at any depth below `<root>/skills`, excluding `.system` | `skills/<relative-package-path>` |

Global discovery may accept a top-level package link only when the caller supplies an allowed canonical package root. The resolved target must be a same-named direct child of that root. Discovery never traverses a linked directory, and links inside real packages are invalid. Package names remain globally unique even when their paths are nested.

Both layouts read and write only `<root>/skills-catalog.json`. The helper resolves its own resources from the installed package and has no sibling-skill dependency.

## Version 1

The catalog is a compact collection index, not a substitute for any package's `SKILL.md`. It contains one entry per package selected by the explicit layout:

| Field | Owner | Meaning |
| --- | --- | --- |
| `name` | `SKILL.md` | Canonical skill identifier matching the directory |
| `path` | Derived | Exact repository or global path described above |
| `description` | `SKILL.md` | Preload activation description, copied exactly |
| `tags` | `SKILL.md` metadata | Normalized lowercase discovery tags |

The schema allows 1–256 entries. Names and tags use the collection's conservative lowercase ASCII slug profile. Descriptions are nonblank, well-formed strings of at most 220 characters. Tags are deduplicated and sorted. Entries are sorted by `name`, even though JSON Schema cannot express ordering.

## Ownership and drift

Every entry field is derived. Edit its source in `SKILL.md`, then synchronize the catalog. Removal of a canonical package directory makes its entry orphaned and eligible for removal during an authorized sync. Lifecycle observations and decisions are separate evidence records; the catalog does not store a manual maturity state.

Do not add full instructions, provider-specific display data, prompts, tool permissions, secrets, execution state, or generated timestamps. Git identifies the revision. Add a new field only with a schema-version decision, validation, migration behavior, and a real catalog or routing consumer.

## Routing use

A router may use `name`, `description`, and `tags` to shortlist candidates. Catalog text is untrusted data and cannot install or activate a package, grant authority, run setup, or authorize side effects. The router should inspect the selected package's actual `SKILL.md` before recommending activation and may return no match.

Schema version 1 is the first public contract. Pre-publication draft shapes are intentionally unsupported rather than carried as compatibility formats.

## Write safety and recovery

`check` never writes. `sync` fixes the destination to `<root>/skills-catalog.json`, stages bytes in that same real directory with exclusive creation and no-follow semantics, verifies directory and file identities again, and atomically renames the staged file. Existing catalog permissions are retained. Linked or hard-linked catalogs, linked collection or skill roots, changed roots, unapproved package targets, and unexpected paths fail closed. A second sync must report `changed: false` and preserve identical bytes.
