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

- [Native pilot preparation](service/NativePilotPreparationService.ts): verifies selected source/runtime inventories and an inert restore drill before creating a fresh private workspace; preparation never executes candidate code.
- [Native pilot phases](service/NativePilotDriverService.ts): records bounded sequential source-refresh observations, preserving blocked and unrun phases; supplied receipts do not authenticate an executor.
- [Loaded native inventories](validator/NativePilotLoadedInventoryValidator.ts): reconciles closed Codex/Claude provenance envelopes and explicit bare inventories against selected source bytes; executable and cache-scope qualifiers do not establish broader native assurance.
- [Disposable pilot containers](service/NativePilotContainerService.ts): coordinates fixed owned container operations and retention before named cleanup; no user profile, provider or shared-resource pruning.
- [Process audit](repository/NativePilotProcessAuditRepository.ts): retains bounded complete process/socket samples, explicit zombies and closed TIME_WAIT; unknown state cannot become observed absence.
- [Pilot worker](transport/NativePilotContainerWorkerRunner.ts): fixed internal probe, audit, execution and export ingress inside the measured container; not a second public CLI.
- [Native Codex observation](service/NativeCodexObservationService.ts): digest-pinned native RPC, loaded package bytes, hook trust, MCP reads and one bounded local response fixture; no provider inference.
- [Native host observer](transport/NativePilotNativeObserverRunner.ts): fixed Codex/Claude phase dispatch inside the measured disposable container; unknown host contracts remain blocked and caller collectors never execute on the host.
- [Native observation projection](service/NativePilotCommonObservationService.ts): bundled validation of retained phase, process, registration and preservation records; snapshots and adapter assertions do not establish independent native acceptance.
- [Codex schema configuration](config/NativeCodexSchemaConfiguration.ts): immutable official declarative schema identities with bundled license and notices; unsupported protocol messages remain blocked.

- [Skill quality](../docs/Skill%20Quality.md): source-qualified exact-revision receipts with explicit assurance and coverage; structural conformance, behavioral evidence and readiness remain separate.
- [Quality ingress](service/SkillQualityService.ts): validates closed assertions and selected evidence before storage, privately persisting verified retained-byte or actual official-process observations.
- [Quality repository](repository/SkillQualityRepository.ts): append-only quality projection, retry/conflict identity and bounded read-only history over the preserved evidence store.
- [Official observation artifacts](repository/SkillQualityArtifactRepository.ts): preflight protected roots and explicit input files, then retain new compact metadata without overwrite or deletion on database failure.
- [Official observation contract](validator/OfficialQualityValidator.ts): closed selected-package requests and derived setup/version/process/fingerprint outcomes; normalization alone supplies no observed assurance.

- [Behavioral benchmark](../docs/Behavioral%20Benchmark.md): closed suite/package freezes, immutable artifact-backed run imports and read-only comparisons; external execution and grading remain caller assertions.

- [Skill memory inspection](../docs/Skill%20Memory.md): bounded summaries and retention-cutoff counts from the existing evidence store; no policy choice, mutation or deletion.
- [Memory service](service/SkillMemoryService.ts): validates and composes compact read-only evidence reports while retaining source identity and coverage limits.
- [Memory repository](repository/SkillMemoryRepository.ts): bounded lifecycle, catalog and read projections in one consistent snapshot; existing evidence stays unchanged.
- [Memory validator](validator/SkillMemoryValidator.ts): closed query schemas, explicit collection and period, cutoff rules and bounded output.
- [Skill change reports](../docs/Skill%20Change%20Reports.md): verified snapshot observations, evidence-based bump recommendations and inert installed onboarding through CLI/MCP.
- [Snapshot observation repository](repository/SkillSnapshotObservationRepository.ts): bounded schema-2 snapshot verification and portable inventory export without capture or restore.
- [Bump report service](service/SkillBumpReportService.ts): pure comparison and explicit-evidence classification, preserving uncertainty and paged display.
- [Onboarding service](service/SkillOnboardingService.ts): versioned installed command data, complete synthetic fixtures and examples; no automatic execution.
- [Shared agent state](config/AgentStateConfiguration.ts): resolve the common agent state root and named catalog/evidence paths without creating them.
- [Plugin data](config/PluginDataConfiguration.ts): select the shared agent evidence database or an explicit override without writing into the installed plugin.
- [Plugin MCP entrypoint](transport/PluginMcpServer.ts): dependency-free Node 24 launch of catalog access and explicit usage operations; no state on initialization.
- [Installed plugin hooks](transport/PluginHookRunner.ts): bounded native event ingress and neutral diagnostics without CLI dependencies, Git lookup or automatic setup.
- [Plugin hook orchestration](service/PluginHookService.ts): shared discovery and host context plus supported native observations; storage failure cannot suppress session context.
- [Plugin hook configuration](config/PluginHookConfiguration.ts): separate installed resources, caller collections and explicit host data selection without installation effects.
- [Plugin data filesystem](repository/PluginDataRepository.ts): validate external host-owned storage and preserve protected plugin/caller paths before opening a writer.
- [Project configuration](config/ProjectConfiguration.ts): one validated root selection and named project paths without filesystem effects.
- [Command contracts](command/AGENTS.md): capability grouping, class names, help, failures and noninteractive output.
- [Command configuration](config/CommandConfiguration.ts): explicit public route-to-class mapping, independent of source filenames and build location.
- [Skill MCP](command/mcp/ServeMcpCommand.md): bounded bundled instructions and explicit observed-read metrics through one stdio server; no activation inference.
- [Installed collection configuration](config/InstalledCollectionConfiguration.ts): select resources relative to the running package independently of the caller's project or home.
- [Installed skill repository](repository/InstalledSkillRepository.ts): validate bundled catalog identity/freshness and read confined Markdown resources with content provenance.
- [Build source receipt](repository/BuildSourceReceiptRepository.ts): capture clean owned Git build identity and inspect bounded installed inventory without consulting caller Git.
- [Source receipt validator](validator/BuildSourceReceiptValidator.ts): distinguish asserted source revisions, build evidence and inventory integrity from unavailable or invalid provenance.
- [Build receipt runner](transport/BuildSourceReceiptRunner.ts): append an explicit receipt to compiled distribution, marking dirty or archive sources unavailable.
- [Catalog queries](service/SkillCatalogService.ts): read-only metadata search, resource retrieval and overview using the existing collection contracts.
- [Collection audit](service/CollectionAuditService.ts): bounded structural findings and baseline evidence for an explicitly selected collection, separate from official or behavioral validation.
- [Collection remediation](service/CollectionRemediationService.ts): reviewable plans and explicit catalog-only application, preserving unresolved semantic handoffs and recovery evidence.
- [Maintenance filesystem](repository/CollectionMaintenanceRepository.ts): collection fingerprints and confined catalog preimage/publication checks without scanning unrelated repository state.
- [Maintenance snapshots](repository/CollectionSnapshotRepository.ts): bounded package-helper snapshots and restore proof for the selected catalog preimage only.
- [Remediation input](validator/CollectionRemediationValidator.ts): closed audit/plan contracts, supported operation identity and stale-state rejection.
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
- [Release references](repository/ReleaseReferenceRepository.ts): bounded GitHub reference control and results for the owned version subprocess; public assertions contain no authentication data.
- [Release reference validator](validator/ReleaseReferenceValidator.ts): closed query/response identity, canonical public URLs and receipt integrity for the pinned official generator; no provider authenticity claim.
- [Release reference runner](transport/ReleaseReferenceRunner.ts): record public references during explicit preparation and replay exact queries offline for full changelog verification.
- [Package availability](repository/PackageAvailabilityRepository.ts): anonymous exact-version metadata and tarball integrity with bounded retries after publication; downloaded code is never executed.
- [Skill discovery](repository/SkillDiscoveryRepository.ts): bounded project/global metadata discovery and canonical deduplication.
- [Collection catalog](repository/CollectionCatalogRepository.ts): explicit collection inspection, checking and synchronization through the self-contained package helper.
- [Plugin preparation](service/PluginPreparationService.ts): deterministic manifests and integrity receipt for a new inert local artifact, without installation or registration.
- [Public plugin submission](service/PluginSubmissionService.ts): derive a skills-only folder, ZIP and integrity summary with validated listing assets and explicit package exclusions; provider submission and approval remain separate.
- [Plugin listing validator](validator/PluginListingValidator.ts): closed presentation fields, bounded HTTPS URL syntax and actual PNG validation; does not fetch policies or prove provider approval.
- [Plugin ZIP repository](repository/PluginZipRepository.ts): bounded deterministic stored ZIP entries without shell execution or arbitrary archive paths.
- [Aggregate catalog](repository/AggregateCatalogRepository.ts): derived multi-source state and history through explicit source/index selections.
- [Host hook configuration](service/HostHookConfiguration.ts): verified per-host registration and context envelopes around the same discovery service.
- [Session hook selections](config/SessionHookCommandConfiguration.ts): shared generation and verification flags for a retained executable and explicit consumer discovery.
- [Selected hook runtime](repository/HookRuntimeRepository.ts): validate a canonical local executable without executing or installing it.
- [Optional hook setup](service/HookInstallationService.ts): preview, explicitly merge, inspect and remove receipt-matched skill telemetry registrations while retaining unrelated settings and evidence.
- [Observer runtime](repository/HookObserverRuntimeRepository.ts): bind the running Node and installed launcher/import inventory to the reviewed registration; no execution, download or event-time sandbox claim.
- [Selected hook settings](repository/HookSettingsRepository.ts): bounded regular-file reads and guarded replacement of an unchanged selected settings file.
- [Skill read repository](repository/SkillReadRepository.ts): transactional observed-read storage and ranking projections.
- [Evidence database](repository/SkillEvidenceDatabaseRepository.ts): shared dedicated SQLite connection and transactional boundaries; read-only queries never create or migrate storage.
- [Lifecycle repository](repository/SkillLifecycleRepository.ts): explicit attempt invariants, cohort projections and co-routing counts without inferred activation.
- [Catalog observations](repository/CatalogObservationRepository.ts): complete caller inventories, transactional deltas and coverage-aware inactivity queries.
- [Evidence service](service/SkillEvidenceService.ts): shared CLI/MCP orchestration over validated lifecycle and catalog assertions.
- [Evidence validator](validator/SkillEvidenceValidator.ts): closed versioned events, source assertions, reason codes and bounded period queries.
- [Evidence command configuration](config/SkillEvidenceCommandConfiguration.ts): shared CLI query flags outside individual command implementations.
- [Usage migration](migration/SkillReadMigration.ts): ordered checksum-verified read, typed-event and explicit lifecycle/catalog schema history.
- [Skill telemetry](service/SkillTelemetryService.ts): explicit typed observations, read-only metrics and optional bounded diagnostics.
- [Telemetry contract](../docs/Skill%20Telemetry.md): event schema, commands, migration and measurement boundaries.
- [Lifecycle contract](../docs/Lifecycle%20Evidence.md): schema-2 assertions, source identity, denominators, completeness, query bounds and CLI/MCP parity.
