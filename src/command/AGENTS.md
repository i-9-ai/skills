# CLI command contracts

## Purpose

Expose one discoverable, noninteractive CLI with clear command responsibilities.

## Ownership

Commands adapt user input to services. Parent source instructions own implementation, persistence and validation rules.

## Local contracts

- `bin/index.mjs` is the sole executable launcher; do not add parallel clients or undocumented compatibility aliases.
- Use one command per independently useful operation. Group by stable capability, then operation: `context available-skills`, `hook verify --host codex`, `mcp serve`.
- A reusable operation belongs to its user-facing domain. Lifecycle hooks call that operation; they do not determine its reusable name.
- Class names end in `Command`, and filenames match their class exactly. Register the public route in `CommandConfiguration`; do not derive it from the filename or add a second route registry.
- Commands parse flags, invoke a service and render the result. Filesystem lookup, validation rules, migrations and protocol handling belong to their named components.
- Provide descriptions, meaningful parameter help and representative examples. Invalid input returns a nonzero status. Separate machine-readable output from human diagnostics.
- Keep ordinary commands usable without a TTY. Never prompt, install dependencies, launch a daemon or enable integrations implicitly.
- Repository hook edits require tested handlers and matching configuration verification. Host-global installation remains separately authorized.

## Work guidance

Before adding a group, compare existing responsibilities and preserve one canonical spelling in help, examples, configuration and tests. Retain an old alias only for an evidenced consumer with an explicit transition contract. Remove replaced entrypoints and empty directories after verification.

## Verification

Run command integration tests under `tests/integration/cli/`, strict type checking and repository validation. Test help, invalid flags, output boundaries and synthetic caller paths.

## Child DOX index

- [Skill memory inspection](../../docs/Skill%20Memory.md): `skills memory summarize` and `skills memory retention` inspect an explicit period and collection without modifying evidence or deciding deletion policy.

- [Skill change reports](../../docs/Skill%20Change%20Reports.md): `skills observe`, `skills report bump` and `skills onboarding`, with explicit snapshots, review evidence and no automatic mutations.

- [Hook commands](hook/AGENTS.md): lifecycle ownership, explicit host adapters and registration boundaries.
- [MCP operator guide](mcp/ServeMcpCommand.md): bundled catalog access, lazy caller-owned usage storage and clean protocol output.
- [Catalog access](../../docs/Skill%20MCP.md): installed `catalog search/read/overview` contracts shared with MCP; read-only and independent of project/global discovery.
- [Collection maintenance](../../docs/Collection%20Maintenance.md): explicit audit and plan selection, preview-first evolution, catalog-only supported writes and verified recovery.
- [Telemetry operator guide](../../docs/Skill%20Telemetry.md): explicit record, rankings and trend commands with metadata-only diagnostics.
- [Optional skill telemetry](../../docs/Optional%20Skill%20Telemetry.md): explicit enable, read-only status and receipt-backed disable for selected native hook settings.
- [Lifecycle evidence](../../docs/Lifecycle%20Evidence.md): explicit lifecycle/catalog records, cohort queries, overlap, inactivity coverage and paged history through the same evidence store.
- [Available skills](context/AvailableSkillsCommand.ts): reusable project/global overview with bounded discovery.
- [Repository validation](repo/RepositoryValidateCommand.ts): local collection validation through `repo validate`.
- [Plugin preparation](plugin/PluginPrepareCommand.ts): preview or create an explicit new staging artifact; never registers or installs it.
- [Public plugin submission](plugin/PluginSubmissionCommand.ts): preview or create a skills-only directory submission ZIP; provider identity, review and upload remain separate.
- [Official skills validation](repo/OfficialSkillsValidateCommand.ts): pinned Agent Skills conformance through `repo validate-official` in prepared CI.
- [Version preparation](repo/PrepareVersionCommand.ts): `repo prepare-version` writes local release artifacts and returns a no-note no-op; never commits or publishes.
- [Release verification](repo/VerifyReleaseCommand.ts): `repo verify-release` checks version alignment and optional base-commit release evidence without changing the selected checkout.
- [Release operator guide](../../docs/Release%20Management.md): manual draft-PR and local preparation paths, required review, recovery and separate publication boundaries.
