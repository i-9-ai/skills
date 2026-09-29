# Repository validation source

## Purpose
Maintain local collection checks and the official validation integration through a small layered Node.js design.

## Ownership
Maintainers own these rules. The user's request defines authorized changes.

## Local contracts
Use Node.js 24+ and pinned oclif. Keep folders singular: `config/` resolves named project configuration without I/O; `command/` parses CLI input and renders output; `service/` coordinates use cases; `repository/` owns filesystem/process/SQLite access; `validator/` contains reusable validation rules; `migration/` owns schema history; `transport/` adapts protocol messages. New CLI components use erasable TypeScript with explicit type checking. All repository CLI implementation uses TypeScript; only the bin launcher remains MJS. Portable distributed package helpers keep their package-owned runtime contract. Add entities only for real identity/invariants, not plain data shapes.

Prefer guard clauses, early returns, named predicates, focused classes and logical blank lines. Keep the bin launcher thin and resolve the selected project once through ProjectConfiguration. Its root, local skill directory, Codex hook file and collection manifest paths share that selection; filesystem trust checks remain in repositories. Repository names reflect stored aggregates: SkillReadRepository owns observed-read events and ranking projections, not unrelated metrics.

Use the pinned local Prettier through `npm run format` for CLI source and its tests. Four-space indentation, LF and logical blank lines are the baseline; formatting does not replace clear naming or documentation. `npm run format:check` verifies without writing and is part of `npm run check`. Keep distributed packages and collection fixtures outside this formatter scope.

Keep commands and dependency pins in root `package.json`. After explicit `npm ci`, checks require no Python, additional installation, network, or credentials. Only the CI adapter invokes the external official Python tool inside the workflow's isolated environment. Never execute candidate scripts while validating metadata.

Filesystem checks require an owned workspace that remains stable during the run. Reject unsafe entries and detected changes, bound reads, and preserve unrelated data; do not claim race-proof confinement. The standalone helper remains inside its distributable skill, and repository adapters reuse its behavior without making the skill depend on this directory.

Use classes for cohesive pattern responsibilities: class and import names carry the pattern (`CollectionValidator`, `SkillReadRepository`, `SkillReadMigration`), and filenames match the class, including every `Command`. Entities use domain names without an Entity suffix. CommandConfiguration owns route IDs through oclif explicit discovery; filenames never define public routes. Keep state/dependencies on the responsible instance and make process/storage seams injectable where useful. Reserve session/lifecycle names for hook adapters; reusable discovery is SkillDiscoveryRepository and rendering is AvailableSkillsService. Small private pure helpers need no ceremonial class. ProjectConfiguration owns cohesive named project paths and excludes global-home discovery configuration. Never retain a second functional entrypoint merely for hypothetical compatibility.

## Work guidance
Update affected domain rules, adapters, use cases, tests, and documentation together. Distinguish format conformance, integrity, behavioral evaluation, and publication readiness.

## Verification
Run `npm run check` and inspect the required official workflow result for the exact PR head. Test process adapters using fake executors and temporary fixtures.

## Child DOX index
- [Plugin data](config/PluginDataConfiguration.ts): select a persistent host-owned usage database without writing into the installed plugin.
- [Plugin MCP entrypoint](transport/PluginUsageMcpServer.ts): dependency-free Node 24 stdio launch of the existing usage service.
- [Project configuration](config/ProjectConfiguration.ts): one validated root selection and named project paths without filesystem effects.
- [Command contracts](command/AGENTS.md): capability grouping, class names, help, failures and noninteractive output.
- [Command configuration](config/CommandConfiguration.ts): explicit public route-to-class mapping, independent of source filenames and build location.
- [Skill usage MCP](command/mcp/UsageMcpCommand.md): explicit observed-read recording and period rankings; no automatic hooks or activation inference.
- [CLI operator guide](../bin/index.md): command input, effects, failures and the single launcher.
- [Repository validation](service/CollectionValidationService.ts): coordinates collection checks.
- [Collection validator](validator/CollectionValidator.ts): catalog, upstream-lock, and public-hygiene rules.
- [Collection filesystem](repository/CollectionFilesystemRepository.ts): package integration, aliases and Git-index inspection.
- [Official validation](service/OfficialValidationService.ts): local precheck, pinned installation and conformance.
- [Official validator](validator/OfficialValidator.ts): trusted source and dependency-pin rules.
- [Official process repository](repository/OfficialValidatorProcessRepository.ts): temporary build inputs and shell-free execution.
- [Version preparation](service/ReleaseVersionService.ts): prepare aligned package, lockfile and plugin release artifacts or verify them; no commits or publication.
- [Release artifact repository](repository/ReleaseVersionRepository.ts): bounded release-file I/O, rollback snapshots, Git evidence and pinned Changesets process execution.
- [Release version validator](validator/ReleaseVersionValidator.ts): enforce supported configuration, version alignment and generated-only manifest changes.
- [Skill discovery](repository/SkillDiscoveryRepository.ts): bounded project/global metadata discovery and canonical deduplication.
- [Collection catalog](repository/CollectionCatalogRepository.ts): explicit collection inspection, checking and synchronization through the self-contained package helper.
- [Plugin preparation](service/PluginPreparationService.ts): deterministic manifests and integrity receipt for a new inert local artifact, without installation or registration.
- [Aggregate catalog](repository/AggregateCatalogRepository.ts): derived multi-source state and history through explicit source/index selections.
- [Host hook configuration](service/HostHookConfiguration.ts): verified per-host registration and context envelopes around the same discovery service.
- [Skill read repository](repository/SkillReadRepository.ts): transactional observed-read storage and ranking projections.
- [Usage migration](migration/SkillReadMigration.ts): ordered checksum-verified schema history.
- [Skill telemetry](service/SkillTelemetryService.ts): explicit typed observations, read-only metrics and optional bounded diagnostics.
- [Telemetry contract](../docs/Skill%20Telemetry.md): event schema, commands, migration and measurement boundaries.
