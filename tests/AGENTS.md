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
- [Packed CLI verification](packaging/cli-package.mjs): allowlist and runtime checks under a disposable node_modules tree using only already-installed production dependencies.

- [Configuration unit tests](unit/config): root precedence, stable named paths and invalid-input rejection without filesystem effects.

- [Repository unit tests](unit/repository): bounded discovery, configuration reads, observed-read storage and fake official process execution.
- [Service unit tests](unit/service): configured context rendering and validation orchestration without external effects.
- [Validator unit tests](unit/validator): malformed identity/configuration rejection independent of execution.
- [Migration unit tests](unit/migration): checksum/version identity, idempotence and transactional rejection without resetting evidence.
- [Transport unit tests](unit/transport): protocol state, input bounds, lifecycle cleanup and no inferred evidence.
- [CLI integration tests](integration/cli): real command help/errors, Codex registration, MCP stdio and concurrent SQLite writers.
- [Collection integration tests](integration/collection): package helpers, catalogs, publication hygiene, distribution and cross-layer validation using disposable repositories.
