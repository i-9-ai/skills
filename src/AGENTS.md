# Repository validation source

## Purpose
Maintain local collection checks and the official validation integration through a small layered Node.js design.

## Ownership
Maintainers own these rules. The user's request defines authorized changes.

## Local contracts
Use Node.js 22+ built-ins. Keep pure rules in `domain/`, use-case ordering in `application/`, and filesystem/process access in `infrastructure/`. The CLI presents outcomes and exit codes. Do not add an interface or layer without a real dependency boundary.

Keep commands and dependency pins in root `package.json`. Local checks require no Python, package installation, network, or credentials. Only the CI adapter invokes the external official Python tool inside the workflow's isolated environment. Never execute candidate scripts while validating metadata.

Filesystem checks require an owned workspace that remains stable during the run. Reject unsafe entries and detected changes, bound reads, and preserve unrelated data; do not claim race-proof confinement. The standalone helper remains inside its distributable skill, and repository adapters reuse its behavior without making the skill depend on this directory.

## Work guidance
Update affected domain rules, adapters, use cases, tests, and documentation together. Distinguish format conformance, integrity, behavioral evaluation, and publication readiness.

## Verification
Run `npm run check` and inspect the required official workflow result for the exact PR head. Test process adapters using fake executors and temporary fixtures.

## Child DOX index
- [CLI](cli.mjs): command selection, outcomes, and exit codes.
- [Repository use case](application/validate-repository.mjs): collection checks.
- [Collection policy](domain/collection-policy.mjs): catalog, upstream-lock, and public-hygiene rules.
- [Collection filesystem adapter](infrastructure/collection-filesystem.mjs): package helper integration, exact aliases, and Git-index inspection.
- [Official use case](application/validate-official.mjs): local precheck, pinned installation, and conformance results.
- [Official policy](domain/official-validator-policy.mjs): trusted source and dependency-pin rules.
- [Official process adapter](infrastructure/official-validator-process.mjs): temporary build inputs and shell-free execution.
