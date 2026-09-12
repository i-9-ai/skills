# Tests

## Purpose
Exercise observable safety and workflow outcomes using disposable synthetic data.

## Ownership
Maintainers own the regression contract.

## Local contracts
Use Node.js built-ins and temporary directories. Never read or modify a user's installed skills, home configuration, credentials, personal records, or production state. Construct credential-like sentinel strings at runtime; do not commit realistic credentials as fixtures. Fake process execution in orchestration tests so the suite cannot install dependencies, invoke Python, or make network requests.

## Work guidance
Test meaningful acceptance and rejection behavior, confinement, no-overwrite, and evidence integrity. Keep structural tests separate from agent behavioral evaluation claims.

## Verification
Run `npm test` from the repository root. Tests make no network requests and leave no fixture files in the checkout.

## Child DOX index
- [Skill helper tests](skill-tools.test.mjs): isolated scaffold, package, and handoff regressions.
- [Distribution tests](distribution.test.mjs): detached package resources, read-only installations, directory aliases, and separate caller workspaces.
- [Repository tests](repository.test.mjs): catalog, source locks, links, aliases, and publication corpus.
- [Official validation orchestration tests](official-validator.test.mjs): configuration, discovery, failure propagation, installation order, and temporary-file cleanup.
