# Global skills catalog

## Objective

Make `skills-catalog` a self-contained package that can safely inventory either a repository collection at `<root>/.agents/skills` or a global collection at `<root>/skills`, while always writing the catalog only at the explicit collection root.

## Scope

- Add an explicit `repository` or `global` layout to the catalog helper.
- Remove the helper's runtime dependency on another skill package.
- Allow global top-level package links only when every resolved target is confined to an explicitly allowed package root.
- Discover nested real packages in the global collection without traversing links.
- Protect the collection root, catalog destination, temporary file, and atomic replacement from links, hard links, and path changes.
- Document exact commands, inputs, outputs, failure behavior, and a read-only fallback.
- Exercise repository, global, linked-package, standalone, confinement, and idempotence behavior in disposable fixtures.
- Keep the first public catalog contract at schema version `1`, with package identity and routing metadata only; lifecycle decisions remain separate.

## Exclusions and authority

The helper does not infer a collection layout, follow arbitrary links, edit package sources, choose a skill, install a package, publish a catalog, or write outside `<root>/skills-catalog.json`. A caller must authorize `sync`; `check` remains read-only. This plan does not authorize release preparation or publication.

## Acceptance

1. Existing repository calls remain compatible and produce `.agents/skills/<name>` paths.
2. `--layout global` inventories `<root>/skills`, produces `skills/<relative-package-path>` entries, and ignores only documented global host files and the excluded `.system` directory.
3. A global package link is rejected unless its resolved target is a direct child of an explicit `--allow-package-link-root`; nested links are rejected.
4. The output is exactly `<root>/skills-catalog.json`; linked roots, linked or hard-linked outputs, changed directory identities, and unexpected temporary-file identities fail closed.
5. A copied `skills-catalog` package runs without sibling packages.
6. Two authorized syncs produce identical bytes and the second reports no change.
7. Repository checks and Changeset status pass; official validation is reported separately for the exact reviewed revision.
8. Synchronization emits schema version `1`, rejects other versions, does not preserve unpublished draft compatibility, and never adds a manual lifecycle-status field.

## Verification

Run focused Node.js tests for the catalog helper, then `npm run check`, `npm run changeset:status`, and `git diff --check`. Fixtures must live under the operating system temporary directory and must not read or write the user's installed collection.

## Rollback

Revert the helper, schema, documentation, tests, and Changeset together. Existing repository layout calls remain the compatibility baseline.
