# Reproducible skill behavioral benchmark

## Objective and acceptance

Turn the existing evaluator contract into a small runnable collection benchmark:
freeze cases and exact package bytes, retain real externally executed artifacts,
and compare a no-skill baseline with the selected skill under declared comparable
conditions. The user's accepted evolution sequence starts with this benchmark;
quality receipts in memory, recurring native-host pilots and an independent
module pilot remain separately tracked follow-ups.

Acceptance requires four frozen synthetic cases, separate executor prompts and
evaluator rubrics, immutable run imports, exact artifact identities, explicit
critical failures, and an actual paired agent exercise. Creation, a refactoring
plan, authorized additive migration and an untouched collision/refusal case
must stay within the selected skill's responsibility. One observed pair is not
statistical evidence, production readiness or cross-provider coverage.

## Scope and exclusions

Add `benchmark prepare`, `benchmark import-run` and `benchmark compare` to the
existing CLI, with focused Command, Service, Repository and Validator classes.
Use existing Node.js 24 built-ins, package identity conventions and oclif; add no
dependency, second launcher, database or provider-specific execution engine.
Bundle an inert demonstration corpus in public documentation. Leave canonical
skills and their portable evaluator procedure unchanged.

The CLI prepares and inspects explicitly selected local data. It never executes
commands from a case, calls a model, installs packages, enables hooks or writes
to a user's home. Imported executor and evaluator statements remain assertions;
hash verification proves bytes, not authorship or genuine model execution.
Fixtures, manual exercises and agent executions are distinct. Unknown metrics
are null, and wall time must not be presented as inference latency.

No release preparation, registry publication, production deployment, external
repository creation or global skill installation is part of this delivery.

## Instruction map

Retain `AGENTS.md` as repository authority, `src/AGENTS.md` for the singular
N-layer components, `src/command/AGENTS.md` for CLI adapters,
`tests/AGENTS.md` for disposable tests, and `plans/AGENTS.md` for this immutable
migration record. No new instruction scope is needed. Add one operational guide
to the existing command/source documentation indexes and public Home page;
package-level procedures remain in their existing SKILL.md entrypoints.

## Implementation sequence

1. Register the accepted work and follow-ups in the existing local Beads store.
2. Validate a closed bounded suite, copy regular confined fixtures and selected
   packages to a new owned directory, and freeze their inventory and rubric.
3. Validate run identity, frozen suite and complete criteria; verify/copy bounded
   artifacts to new immutable run directories without overwriting older runs.
4. Compare only paired cases with the same frozen suite and declared comparable
   environment; expose incomplete pairs, critical failures and unknown metrics.
5. Freeze the four-case corpus before agent runs. Execute fresh paired contexts
   outside the CLI, then have a separate evaluator inspect actual outputs.
6. Add meaningful rejection/integration tests, operator documentation, a
   Changeset and an independent review of the exact commit before PR delivery.

## Validation and evidence

Run explicit `npm ci` with Node.js 24, affected unit and CLI integration tests,
`npm run check`, `npm run package:check`, `npm run changeset:status` and
`git diff --check`. Test traversal, symlinks, existing output, oversized data,
tampering, incomplete/fixture pairs, unknown metrics and critical failures.
Keep ordinary automated tests offline and isolated from real home/configuration.

Retain frozen input/package/rubric hashes, selected run configuration, executor
output identity, independent grading evidence and limitations. Actual agent runs
use disposable caller workspaces and synthetic data; publish only sanitized
artifacts/summary. Official conformance and real-host testing are reported
separately. No imported pass may certify full skill readiness.

## Rollback and removal

Revert the new route registrations, classes, guide, corpus and release note as
one coherent change. Existing commands, evidence schemas and installed packages
remain unaffected. Benchmark workspaces are caller-owned evidence and are not
deleted by the CLI or a source rollback.
