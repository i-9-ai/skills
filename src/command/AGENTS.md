# CLI command contracts

## Purpose

Expose one discoverable, noninteractive CLI with clear command responsibilities.

## Ownership

Commands adapt user input to services. Parent source instructions own implementation, persistence and validation rules.

## Local contracts

- `bin/index.mjs` is the sole executable launcher; do not add parallel clients or undocumented compatibility aliases.
- Use one command per independently useful operation. Group by stable capability, then operation: `context available-skills`, `hook verify --host codex`, `mcp usage`.
- A reusable operation belongs to its user-facing domain. Lifecycle hooks call that operation; they do not determine its reusable name.
- Class names end in `Command`. Files below this tree use oclif command-ID spelling, an intentional exception to class-matching filenames elsewhere.
- Commands parse flags, invoke a service and render the result. Filesystem lookup, validation rules, migrations and protocol handling belong to their named components.
- Provide descriptions, meaningful parameter help and representative examples. Invalid input returns a nonzero status. Separate machine-readable output from human diagnostics.
- Keep ordinary commands usable without a TTY. Never prompt, install dependencies, launch a daemon or enable integrations implicitly.
- Repository hook edits require tested handlers and matching configuration verification. Host-global installation remains separately authorized.

## Work guidance

Before adding a group, compare existing responsibilities and preserve one canonical spelling in help, examples, configuration and tests. Retain an old alias only for an evidenced consumer with an explicit transition contract. Remove replaced entrypoints and empty directories after verification.

## Verification

Run command integration tests under `tests/integration/cli/`, strict type checking and repository validation. Test help, invalid flags, output boundaries and synthetic caller paths.

## Child DOX index

- [Hook commands](hook/AGENTS.md): lifecycle ownership, explicit host adapters and registration boundaries.
- [Usage MCP operator guide](mcp/usage.md): stdio execution, caller-owned SQLite and clean protocol output.
- [Telemetry operator guide](../../docs/skill-telemetry.md): explicit record, rankings and trend commands with metadata-only diagnostics.
- [Available skills](context/available-skills.ts): reusable project/global overview with bounded discovery.
- [Collection validation](validate.ts): local collection validation command.
- [Plugin preparation](plugin/prepare.ts): preview or create an explicit new staging artifact; never registers or installs it.
- [Official validation](ci-official.ts): CI-only external conformance orchestration.
