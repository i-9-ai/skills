# TypeScript repository tooling assessment

Status: assessment and conditional migration recipe; no migration implemented.

## Objective and scope

Improve the repository validation CLI's maintainability, typed boundaries, and independently testable use cases. This assessment covers repository-owned `src/`, related tests, root command configuration, documentation, and their CI consumers. Distributed `.agents/skills/*/scripts/` remain self-contained JavaScript packages and are outside migration scope.

The user requested an independent assessment of TypeScript, a command framework such as Commander, layered services/repositories, and meaningful unit tests. The assessment does not authorize publication, installation into consumers, merge, release, or other external mutations. No matching open TypeScript validation issue was found during the limited search on 2026-09-13; the related collection work is [PR #2](https://github.com/i-9-ai/skills/pull/2). Associate a dedicated implementation issue when implementation work is scheduled.

## Observed architecture

Inspected baseline: `236aea4ae3b053789e020bf32d3d0e9a8fada235`, branch `codex/session-skill-index`. This is evidence of the inspected checkout, not proof of PR-head identity or CI success.

- `src/cli.mjs` has three commands: `validate`, `ci-official`, and `session-index`. It validates argument count, reports results, and sets exit status in roughly 40 lines.
- `src/domain/` already holds collection, official-validator, and session-index policies; `src/application/` orchestrates use cases; `src/infrastructure/` owns filesystem and process adapters.
- `validateRepository` directly constructs `CollectionFilesystem`; `validateOfficial` directly calls concrete adapters and repository validation. These are concrete seams for better isolated application tests.
- `render-session-index.mjs` performs filesystem access inside the application layer. Moving that access into an adapter would clarify an existing dependency boundary.
- Existing `node:test` suites already exercise pure rules, temporary filesystem fixtures, and fake process executors. They are useful behavioral regressions; many repository tests are integration tests rather than isolated application tests.
- Root contracts require Node.js 22+ and local checks without package installation. The only declared development dependency is Changesets. Repository validation reuses standalone JavaScript helpers; these helpers must remain independent of `src/`.

## Recommendation and tradeoffs

Proceed first with typed boundary design and injected use cases. TypeScript is a reasonable next step for policy results, decoded configuration, filesystem operations, and process execution results. The observed code does not demonstrate a need for a new service/repository folder taxonomy or a command-framework dependency: existing layers already represent those responsibilities. Treat adoption of Commander and a new test runner as separate decisions rather than prerequisites for TypeScript.

| Option | Value | Cost and decision |
| --- | --- | --- |
| Existing JavaScript and Node built-ins | Maintains zero-install local validation; existing layers and tests remain usable | Add injection seams now; JSDoc can document boundaries, but checked JSDoc still needs a compiler for static guarantees |
| TypeScript with native Node execution and built-in command handling | Explicit contracts without a runtime loader or build output | Preferred TypeScript candidate; raise the runtime floor to at least Node 22.18 and restrict syntax to erasable types; static checking needs an explicitly installed compiler |
| TypeScript compiled with `tsc` | Supports an emitted JavaScript runtime | Adds build sequencing, generated-output handling, and stale-output risk; unnecessary for this private repository CLI unless older Node support is required |
| TypeScript with `tsx` | Convenient TypeScript execution | Adds a runtime loader/install dependency; no demonstrated requirement here |
| Commander | Centralizes command declaration, help, parsing, and errors | Useful when options/subcommands grow; adds an installed runtime dependency and may change diagnostics/exit behavior; defer for the present three positional commands |
| Node `util.parseArgs` | Built-in option parser if options are added | Does not provide an entire command framework; sufficient candidate before adding dependencies |
| Vitest or another external runner | Additional runner tooling | Existing `node:test` and `node:assert/strict` satisfy the requested isolation; do not add a runner without a missing capability |

Node 22.18 enables type stripping by default. Stripping performs no type checking, ignores `tsconfig.json` behavior, and does not support syntax requiring code generation in its basic mode. Explicit extensions and type imports matter. A TypeScript migration therefore cannot retain the entire current `>=22` runtime promise without a loader/build or a higher minimum. [Node 22 TypeScript documentation](https://nodejs.org/download/release/v22.21.0/docs/api/typescript.html).

Commander supports TypeScript and configurable output/exit handling; its current documentation requires Node 22.12+. Pin and verify the actual selected release before adoption rather than depending on its moving default branch. [Commander documentation](https://github.com/tj/commander.js/blob/master/Readme.md).

The unresolved contract decision is whether static checking becomes a contributor command after explicit `npm ci`, while `npm run check` remains runnable without dependencies. Recommended: preserve dependency-free runtime validation/tests, introduce a separately named required CI typecheck after explicit dependency setup, and document both guarantees. If all checks must run in a fresh checkout with no installed compiler, retain JavaScript until that requirement changes. Commander would independently remove dependency-free CLI execution unless bundled, which introduces another build contract.

## Conditional implementation sequence

1. Recheck status, current source, matching issue/PR, and baseline tests. Create a coherent isolated implementation branch. Record current outputs and status codes using synthetic fixtures.
2. Introduce narrow operation contracts for collection reads, official execution, and output. Keep rules pure; inject adapters into application use cases and construct concrete adapters at the composition root. Avoid interfaces for functions with no replaceable dependency. Move session-index filesystem reads into infrastructure.
3. Add isolated application tests before changing language. Keep filesystem adapter tests and CLI subprocess tests separate from unit tests. Prove order, failure propagation, cleanup, and aggregation with hand-written fakes.
4. Resolve the runtime/static-check contract above in repository instructions and a focused implementation decision. For native TypeScript, pin TypeScript and Node declarations in root configuration, use strict checking and erasable syntax, and update the Node minimum consistently across engines, CI, docs, and entry checks. No implicit setup at CLI startup.
5. Migrate domain types first, then adapters, use cases, and CLI. Validate parsed external values at runtime before treating them as typed data. Give imports of standalone JavaScript helpers an explicit repository-owned type boundary; do not move compiler dependencies or generated declarations into the installed skills.
6. Update every internal reference to the canonical CLI path, including session hooks, tests, docs, and workflow commands. Do not retain two independent implementations. Preserve command names and successful result schemas. Any intentionally improved help text or invocation path must be documented in a Changeset.
7. Consider Commander only if the actual command interface grows enough to justify it. Configure output and exception-based parser handling so unit tests cannot terminate the host process. This decision requires a distinct dependency/setup plan before implementation.
8. Run the acceptance matrix, record the exact commit, and obtain independent review. No merge or release follows from this assessment.

## Acceptance and verification

| Requirement | Observable check |
| --- | --- |
| Application rules are independently testable | Unit tests use injected in-memory/fake operations, never real filesystem/process/network access; test precheck-before-install ordering, stopping on failure, all-result aggregation, and cleanup |
| Existing safety remains | Adapter regressions cover bounded reads, rejected links/aliases, no overwrite, temporary cleanup, argument arrays with `shell: false`, and failure diagnostics |
| CLI compatibility | Subprocess tests cover all three commands, missing/unknown/extra arguments, stdout/stderr, status codes, and session-index fallback; the official command uses a fake adapter in tests |
| Static guarantees are real | Required `npm run typecheck` fails on a deliberate incompatible fixture during development; strict source checks pass without blanket `any`, unchecked casts of input, or broad suppression |
| Zero-install runtime is preserved if selected | A disposable checkout with no `node_modules` runs `npm run check` on the declared minimum Node version; no network or installation is triggered |
| New setup is explicit | Document exact contributor setup and mutations; `npm ci` uses pinned lockfile inputs; CLI and session hooks never run setup automatically |
| Portable skills remain independent | Existing detached-installation/distribution tests pass; distributed script diffs and dependencies remain unchanged |
| Completion is reviewable | `npm run check`, `git diff --check`, conditional `npm run typecheck`, and `npm run changeset:status` pass; required official workflow succeeds at the exact implementation PR head |

Structural tests and type checks do not establish skill behavioral effectiveness, provider testing, publication readiness, or race-proof filesystem confinement. Planning-only delivery does not claim any implementation checks have passed.

## Rollback and retained evidence

Keep migration commits cohesive so a revert restores the previous source paths, command definitions, runtime minimum, documentation, and workflow together. Do not keep stale generated JavaScript or duplicate old command paths as rollback machinery. If adding a compiler or framework, remove its lockfile entries and setup requirements in the same revert and rerun baseline checks. Preserve unrelated package work.

Retain baseline and migrated command behavior, Node/compiler versions, check outcomes, dependency/runtime decision, Changeset, and independent review identity in the implementation PR. This assessment is preserved as the decision record; later adoption decisions receive their own timestamped plan.
