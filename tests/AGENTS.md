# Tests

## Purpose
Exercise observable safety and workflow outcomes using disposable synthetic data.

## Ownership
Maintainers own the regression contract.

## Local contracts
Use the Python standard library or Node.js built-in test runner and temporary directories. Never read or modify a user's installed skills, home configuration, credentials, personal records, or production state. Construct credential-like sentinel strings at runtime; do not commit realistic credentials as fixtures. Fake process execution in orchestration tests so the suite cannot install dependencies or make network requests.

## Work guidance
Test meaningful acceptance and rejection behavior, confinement, no-overwrite, and evidence integrity. Keep structural tests separate from agent behavioral evaluation claims.

## Verification
Run `python3 -m unittest discover -s tests -v` and `node --test tests/test_validate_skills.mjs` from the repository root. Tests make no network requests and leave no fixture files in the checkout.

## Child DOX index
- [Tooling tests](test_skill_tools.py): isolated scaffold, package, run, and collection regressions.
- [Official validation orchestration tests](test_validate_skills.mjs): discovery, failure propagation, installation order, and temporary-file cleanup.
