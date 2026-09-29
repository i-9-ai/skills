# Package provenance and format maintenance

## Existing implementation

This package separates the local index from canonical catalog maintenance. The original baseline is [i-9-ai/skills at af8ab1a50dc76e4bebbcb0d85671633bb96d76af](https://github.com/i-9-ai/skills/tree/af8ab1a50dc76e4bebbcb0d85671633bb96d76af), licensed Apache-2.0. Reviewed inputs were `.agents/skills/skills-catalog/SKILL.md`, `scripts/aggregate_index.mjs`, `scripts/catalog_tools.mjs`, `references/aggregate-index.md` and the aggregate integration tests. PR #2 review corrections to duplicate-key handling, source specification parsing and distinct evolution participants are retained during extraction.

- Retain the complete aggregate helper, SQLite schemas and migrations, current JSON fallback, history and evidence-ledger behavior.
- Resolve the entrypoint's real path so a copied installation reached through a filesystem alias still runs its commands. The detached-package exercise checks both direct and aliased invocation.
- Adapt the procedure and examples to a separately installed package with one local-index outcome.
- Extract only bounded JSON parsing and schema-v1 catalog validation into `scripts/catalog_data.mjs`. It has no collection discovery or catalog write capability.
- Exclude canonical inventory generation and host installation. A separately available catalog skill may produce sources, but it is not a runtime dependency.

The read-only decoder is bundled because installed packages must work independently. Its accepted schema must match the canonical catalog writer. Repository tests compare valid and invalid synthetic inputs across the two implementations; update both readers and those tests when the public catalog format changes. Do not replace the local import with a relative reference to a sibling package.

No external skill text or private process record was copied. This extraction changes ownership, not the storage format. An existing local index opens without a new schema migration.

## Icon

The named `storage` symbol is from [Google Material Design Icons at the pinned revision](https://github.com/google/material-design-icons/blob/40a7a292a79d9394157e1ea24f83d52d5e17c556/src/device/storage/materialicons/24px.svg), Apache-2.0. Its three indexed rows distinguish this local multi-source store from the list glyph used by canonical catalog maintenance. The frame and amber palette are original composition; the source glyph remains recognizable. See the bundled `NOTICE` and `LICENSE`.

`assets/icon.png` is a 256 × 256 raster rendering of the reviewed `assets/icon.svg`, produced with `rsvg-convert`. The SVG remains the editable source and includes no external resource, active content or embedded raster data.
