---
"i9-skills": minor
---

Unify repository tooling behind an oclif CLI with a thin bin launcher and Node 24
TypeScript command, configuration, service, repository, validator, migration and transport layers.
Centralize validated project selection and named local paths in ProjectConfiguration,
keeping global discovery inputs separate.
Add pinned Prettier formatting through `format` and `format:check`; the standard
check verifies CLI source and its tests without rewriting distributed packages.
Add dynamic project/global skill discovery through `context available-skills`,
with canonical deduplication, source labels and disclosed coverage limits.

Expose the session adapter through `hook session-index`, Codex configuration
rendering/comparison through `hook codex session-config` and `hook codex verify`,
and explicit read metrics through `mcp usage --db PATH`. Keep collection validation behavior, and remove the superseded standalone
executables and transitional command aliases. Organize tests by unit layer
and separate CLI/collection integration contracts. Automatic read collection and npm
plugin publication remain outside this checkout-only delivery.
