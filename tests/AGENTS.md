# Tests

## Purpose
Exercise observable safety and workflow outcomes using disposable synthetic data.

## Ownership
Maintainers own the regression contract.

## Local contracts
Use Node.js built-ins and temporary directories. Never read or modify a user's installed skills, home configuration, credentials, personal records, or production state. Construct credential-like sentinel strings at runtime; do not commit realistic credentials as fixtures. Fake process execution in orchestration tests so the suite cannot install dependencies, invoke Python, or make network requests.

Keep unit suites aligned with source responsibilities and integration suites separate. Test filenames may identify the exercised component; do not create empty layer directories merely to mirror the source. Shared fixtures must preserve their own relative symlink/data paths when a test file moves.

Unit, CLI integration and packaging test code uses the repository's pinned Prettier (`npm run format`); collection integration fixtures are excluded. Preserve meaningful blank lines and fixture contents. `npm run check` includes non-mutating format verification before behavioral tests.

## Work guidance
Test meaningful acceptance and rejection behavior, confinement, no-overwrite, and evidence integrity. Keep structural tests separate from agent behavioral evaluation claims.

## Verification
Run `npm test` from the repository root. Tests make no network requests and leave no fixture files in the checkout.

## Child DOX index

- [GitHub family consumer](integration/collection/github-family-consumer.test.mjs): original issue/Wiki consumer evidence through existing catalog helpers; no actual GitHub, domain-package or native-host execution.
- [Native pilot preparation](unit/service/NativePilotPreparationService.test.mjs): inert source/runtime identity and restore rejection with synthetic disposable inputs; no native execution.
- [Native pilot orchestration](unit/service/NativePilotDriverService.test.mjs): fake phase journals, blocked observations and preservation/cleanup boundaries; no Docker or provider calls.
- [Loaded inventory contracts](unit/validator/NativePilotLoadedInventoryValidator.test.mjs): complete inventories, provenance, manifest bytes and alias rejection; synthetic tests do not prove native execution.
- [Native MCP readiness](unit/service/NativeCodexMcpReadiness.test.mjs): fake bounded startup, complete pagination and terminal-state rejection within unchanged request and time limits; no native client execution.
- [Claude debug alias](unit/repository/NativePilotClaudeDebugAlias.test.mjs): inert selected debug-link text with an ordinary captured target; no filesystem resolution or native acceptance.
- [Process audit](unit/repository/NativePilotProcessAuditRepository.test.mjs): injected process/socket samples verify unknown-state rejection and explicit terminated residuals; tests do not inspect the machine's process table.
- [Federated consumer pilot](integration/collection/federated-consumer.test.mjs): real catalog helpers and test-only bounded handoffs across fictional independent owners; no semantic routing or model evaluation claim.
- [Packed CLI verification](packaging/cli-package.mjs): allowlist and runtime checks under a disposable node_modules tree using only already-installed production dependencies.
- [Packed Git source receipt](packaging/git-source-receipt.mjs): real clean synthetic Git builds retain asserted source provenance after packaging removes Git metadata.

- [Configuration unit tests](unit/config): root precedence, stable named paths and invalid-input rejection without filesystem effects.

- [Repository unit tests](unit/repository): bounded discovery, configuration reads, observed-read storage and fake official process execution.
- [Service unit tests](unit/service): configured context rendering and validation orchestration without external effects.
- [Validator unit tests](unit/validator): malformed identity/configuration rejection independent of execution.
- [Migration unit tests](unit/migration): checksum/version identity, idempotence and transactional rejection without resetting evidence.
- [Transport unit tests](unit/transport): protocol state, input bounds, lifecycle cleanup and no inferred evidence.
- [CLI integration tests](integration/cli): real command help/errors, Codex registration, MCP stdio and concurrent SQLite writers.
- [Collection integration tests](integration/collection): package helpers, catalogs, publication hygiene, distribution and cross-layer validation using disposable repositories.
