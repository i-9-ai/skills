# Unified CLI and host usage adapters

## Objective

Replace the repository's fixed three-argument parser with one portable
TypeScript CLI based on oclif. Preserve validation and session-index behavior
while adding the usage MCP as a CLI command. Make command
ownership, application services, and I/O repositories explicit and testable.

## Scope

- Add `@oclif/core` and its lockfile entry.
- Add pinned TypeScript and Node type declarations for no-emit checks. Add
  `yaml` for standards-aware external skill frontmatter, rejecting duplicate
  keys, aliases and custom tags rather than treating the collection's narrower
  internal parser as a universal host format.
- Use Node.js 24 native TypeScript type stripping with erasable TypeScript
  syntax. The runtime command remains directly runnable; no hidden build or
  install step runs when a command starts.
- Introduce singular `command/`, `service/`, and `repository/` source
  directories. A command adapts oclif input and renders output, a service owns
  one use case, and a repository owns filesystem or process access.
- Migrate validation and discovery into capability-specific commands with
  command names, then expose `mcp usage --db PATH` as the MCP process entry.
  MCP is the stable transport group; usage is its first responsibility.
  Use only the canonical `mcp usage` command.
- Make available-skills discovery read the project collection and the installed global
  collection when explicitly present, deduplicating canonical real paths and
  retaining source labels. Host-specific paths are optional fallback adapters,
  never assumed duplicates.
- Keep the dedicated usage database. The command does not write to a catalog
  database or infer activation from reads.
- Keep the Codex hook read-only and have it call the canonical CLI command.
  Map only host events whose payload can prove a skill-file read; no home-hook
  installation or automatic telemetry is part of this change.

## Exclusions

- No publishing, consumer installation, automatic plugin installation,
  automatic host-hook enablement, or changes to home configuration.
- No npm registry publication in this delivery. A later, separately authorized
  distribution release may publish the package as `@i-9-ai/skills` and expose
  the short `i9-skills` command through `bin`. It must test the packed artifact
  in a clean Node 24 environment and pin any hook invocation to a reviewed
  release. Session hooks may diagnose a missing executable and show a manual
  fallback, but must never install it or fetch an unpinned latest version.
- No conversion of distributable skill scripts or a repository-wide TypeScript
  rewrite.
- No shared catalog/usage database writer and no host-specific configuration
  format implementation beyond the documented adapter plan.

## Design and readability rules

- Folders are singular because each file represents one command, service, or
  repository responsibility.
- Prefer guard clauses, named predicates, and small focused classes or
  functions over `else if` chains or nested `else` blocks.
- Separate validation, normalization, main work, and output/error handling
  with blank lines where it improves comprehension.
- Explain Node scripts in natural language: inputs, work, output location,
  effects, and verification. Preserve paragraphs and meaningful sections;
  token efficiency never justifies opaque compressed code.

## Implementation sequence

1. Freeze current CLI behavior with command-level characterization tests.
2. Add the oclif dependency and Node 24 TypeScript runtime configuration.
3. Move composition into repositories and services without changing domain
   policy or repository-validation behavior.
4. Implement one oclif command per responsibility, preserving validation
   outcomes and documenting the canonical command spelling.
5. Make the MCP process a `mcp usage` command and remove the superseded
   standalone wrapper and command aliases.
6. Update the available-skills service and Codex adapter to use the single CLI
   path. Document tested and unimplemented lifecycle event adapters.
7. Run unit, command, repository, Changeset, whitespace, and official skill
   validation. Obtain independent review of the exact commit.

## Acceptance

- `repo validate`, `repo validate-official`, and `context available-skills`
  run through the canonical CLI with their prior observable behavior.
- Every command file matches its exported class name, ending in `Command`.
  Explicit registration owns route spelling independently of the filename.
- `mcp usage --db PATH` starts the existing bounded stdio server using a
  caller-owned dedicated database.
- Commands have explicit help and invalid-input behavior.
- The CLI source is TypeScript, directly runnable on Node.js 24 without a
  runtime transpiler dependency.
- Project and global skill collections are discovered safely and duplicate
  real paths are reported once.
- Tests use disposable fixtures and do not read or write a real home directory.

## Validation and rollback

Run `npm run check`, command-level tests, `npm run changeset:status`,
`git diff --check`, and the official skill validator. Revert the cohesive CLI
commit to restore the current JavaScript entrypoint and independent MCP
wrapper. The usage database remains caller-owned and is never removed.

## Instruction hierarchy map

The root contract remains the collection authority. Update `src/AGENTS.md`
from application/domain/infrastructure terminology to the singular N-layer
folders: command, service, repository, policy, migration, and transport.
Entities are introduced only when identity and invariants justify a separate
component; read-event DTOs alone do not justify an entity directory.
`bin/index.mjs` is a thin launcher covered by the root contract and its
same-basename operator guide. Keep the tests, plans, and Codex child contracts;
update their indexes and input/side-effect descriptions together.

## Runtime and framework evidence

Use the installed `@oclif/core@5.0.0` explicit discovery with a singular command
directory and one route map. Node 24 strips erasable TypeScript during source execution; explicit
type checking remains a development check. Node refuses native stripping under
node_modules. The subsequent [meta-skill delivery plan](2026-09-19-14-34-36-meta-skill-delivery.md)
adds an explicit compiled build and local packed-artifact test; registry and
plugin publication remain separate boundaries.

The oclif skill was used with its complete implementation and migration guides.
Its explicit-discovery/manifest incompatibility assertion conflicts with the
official discovery guide and installed framework. The initial implementation
used pattern discovery; the inaugural naming correction below replaces it with
the supported explicit map without changing installed skills.

Sources: [oclif discovery](https://oclif.io/docs/command_discovery_strategies/)
and [Node TypeScript](https://nodejs.org/api/typescript.html), checked during
implementation. No upstream implementation code was copied.

## Command registration correction

[Issue #18](https://github.com/i-9-ai/skills/issues/18) completes the original
class/file naming requirement. The source contract's command-file exception
did not implement the requested convention and is removed. This refinement
belongs to the inaugural CLI baseline rather than a second architecture.

1. Rename all command files to their exported class names; update imports and
   indexed links. Keep existing capability directories and no duplicate clients.
2. Add `CommandConfiguration` with the explicit route-to-class map. Export that
   map from the existing CLI module for oclif's `explicit` strategy. The source
   launcher points to the TypeScript module; the package points to compiled JS.
   There is no runtime compiler, new dependency or filesystem-based route naming.
3. Use `RepositoryValidateCommand` for local `repo validate --project PATH` and
   `OfficialSkillsValidateCommand` for `repo validate-official`, which performs
   local checks and the pinned Agent Skills validator in its prepared CI environment.
   Preserve the `validate` and `ci:official` npm scripts used by workflows while
   changing their underlying routes. No external consumer of the old CLI spellings
   was found, so retain no hidden alias.
4. Update help, examples, operator documentation, Changeset and scoped contracts.
   Root instructions still govern source, then `src/AGENTS.md`, then
   `src/command/AGENTS.md`, with `hook/AGENTS.md` only for host lifecycle rules.
   `config/` gains a named route owner without requiring another instruction file.
5. Exercise every registered route's help in the checkout and packed artifact,
   representative actual calls, unknown flags, required project selection and
   absence of filename-derived or obsolete command routes. Run `npm run check`,
   `npm run package:check` serially, Changesets and whitespace checks; retain the
   exact-commit independent review and matching CI result.

No host settings, usage databases, distributed skill procedures or publication
permissions change. The existing hook and MCP routes remain unchanged. Reverting
this coherent correction restores the former command loader and filenames without
touching caller data. The earlier standalone-CLI rollback above describes the
original migration, not this naming correction.

## Final command taxonomy and cleanup

`context available-skills` describes the reusable user outcome: inspect the
skills discoverable for this session. `hook session-index` owns its lifecycle
entry; Codex-specific JSON rendering/comparison lives under
`hook session-config --host codex` and `hook verify --host codex`. `hook list` reports
implemented/planned adapters. `mcp usage` is the first MCP responsibility.
No host settings are installed and no automatic usage emitter is enabled.

SkillReadRepository owns immutable observed-read events and their period
ranking projection. Broader skill-metrics or activity names would claim
unimplemented activation/quality measurements. Entities are unnecessary for
the present validated DTOs. Validators are separate reusable pure components.
An Event Dispatcher is deferred: there is currently one synchronous consumer
per boundary and no fan-out. Future typed events must distinguish external host
events from internal observations, with tested subscriber failure/disablement.

Migration manifest:

- Move collection/official use cases to `service/`, filesystem/process
  adapters to `repository/`, and pure policies to `validator/`.
- Replace the fixed catalog session renderer with bounded package discovery.
  Remove its old application and domain files and update regression tests.
- Replace the standalone usage server/store bodies with TypeScript transport,
  SkillReadRepository, validator and migration components.
- Remove temporary repository wrappers that merely forwarded service calls.
- Remove superseded standalone CLI/MCP launchers; no external consumer
  was demonstrated. The bin launcher is the only executable entrypoint.
- Remove obsolete root command aliases.
- Remove emptied legacy directories after verifying they contain no files.

The shared project configuration, explicit TypeScript no-emit check, human-readable
guard clauses and meaningful blank lines are part of the accepted code style.
Runtime examples, limits and failure recovery live in `bin/index.md`.

## Planned named events and operational logs

Keep the existing read-event API and checksum-verified database history during
this migration. A future host emitter uses a versioned JSON envelope with
`eventType` (for example `skill.read.observed`), cryptographic UUID `eventId`,
UUID `correlationId` shared by the pre/post pair, canonical UTC `occurredAt`,
`schemaVersion`, `sourceHost`, `sourceAdapter`, and a bounded allowlisted
payload. Use Node's `crypto.randomUUID()`, never JavaScript Symbol. Allocate
once per observation; retries reuse the ID. The present MCP accepts the
emitter's explicit event ID and enforces idempotency.

Host lifecycle names and internal observation names remain separate. Planned
tests cover unknown type/schema rejection, stable correlation, retry/conflict
handling, subscriber order/failure/disablement and no prompt payload. No emitter,
event dispatcher or new envelope is claimed active in this CLI migration.

MCP operational logs are separate from observed-read metrics. The planned
interface is an optional explicit `--log-file` with structured JSON Lines:
timestamp, level, component, event/correlation IDs and sanitized error category.
No payload, skill body, prompt, secret, raw response or automatic per-read log.
Use bounded files with rotation/retention configured before enabling this sink.
The current delivery emits concise startup diagnostics on stderr and protocol
messages on stdout; persistent operational logging is not implemented.

## Local telemetry center: phased implementation contract

The CLI remains the single operator entrypoint. A local telemetry module will
own normalized ingestion, an event-type/schema catalog, migration history,
read/activation/outcome projections, bounded operational logs and reporting.
External host adapters supply evidence; neither MCP nor the database infers
activation from a file read. Each event links revision/source, opaque session
and correlation identifiers. Prompts, source bodies and secrets are excluded.

Phase 1 (implemented here): explicit observed-read ingestion and period
rankings in the dedicated usage database, with distinct sessions, retry
idempotency, conflict rejection and cooperating-writer transactions. CLI and
MCP share the repository and migration owner. Discovery is read-only.

Phase 2 (planned): typed versioned envelopes, verified host read emitters,
attempt/activation/outcome/block-reason types only where provable, source
attribution, trend and co-occurrence queries, bounded stderr/file logging,
event export and aggregate reports. Implement one ingestion service and
subscribers only when multiple consumers justify a dispatcher.

Phase 3 (planned): retention by event class, preview-before-prune, transactional
pruning, verified SQLite backup/restore and schema upgrade rehearsals.
Projected counts report their retained period and coverage, distinguishing
missing telemetry from no use. Backups remain caller-owned and outside source
collections. Do not replace or reset an unknown database.

Dashboard and remote export are separate future scopes. There is no daemon,
network listener, automatic home-hook installation or background collection
by default. Optional emitter failure preserves the user's task and reports
telemetry gaps without fabricating events.

Pinned dependencies: oclif 5.0.0 owns CLI discovery/help/arguments; YAML 2.9.1
reads external standard frontmatter under bounded input and rejects aliases,
custom tags and duplicate keys; TypeScript 5.9.3 plus Node 24 declarations own
development type checking. The lockfile records integrity. Reverting this
cohesive migration restores the previous dependency set without touching
consumer data. Tested compatibility is not a complete security audit.

## Human terminal UI assessment

The Ink skill was inspected. Current commands print a bounded overview, JSON
configuration, validation results or MCP protocol; none currently needs
interactive terminal state. Keep these deterministic outputs in this migration.

Ink is a candidate for the telemetry report phase when comparison, filtering
or live diagnostics justify it. Add an explicit `--ui` selection and a
`--format text|json` policy, TTY detection, accessible Text-wrapped content,
and a plaintext fallback. JSON and MCP stdio must never mount React/Ink.
Pin React/Ink and component-test dependencies with that report capability;
test screen-reader behavior, non-TTY operation, clean exit and package runtime.
The current CLI does not claim an Ink interface.

## Final client consolidation

The user requires one TypeScript CLI core, with only `bin/index.mjs` retained as the minimal Node launcher. Convert remaining repository-owned MJS validators, services and repositories to typed modules; distributed skill utilities remain package-owned. Remove transitional executable aliases because no external consumer is demonstrated. Move tests into responsibility-oriented unit folders and distinct integration suites, updating relative fixture roots, npm discovery and documentation. Preserve all existing behavioral assertions and add direct layer tests where integration coverage previously obscured the boundary. Re-run type checking, the complete suite on Node 24, collection validation, command/help and hook verification, package dry-run and stale-reference checks before deleting superseded paths. Ink is declined for this delivery.

Only implemented hook handlers may be registered: SessionStart invokes the tested session-index wrapper. PreToolUse/PostToolUse read collection is not registered because read-proof normalization, correlation, emitter configuration and failure-policy fixtures are not implemented.

## Cohesive object boundaries

Repository-owned source is TypeScript, with cohesive classes named for their patterns and matching source files. Command filenames match their exported classes, ending in `Command`; `CommandConfiguration` owns the explicit route IDs. Validator internals are private methods; services own dependency seams, repositories own filesystem/process/SQLite effects, and SkillReadMigration owns transactional schema history. The framework launch function remains a thin utility. ProjectConfiguration owns the cohesive project-path selection contract. No entity layer is created for data-only shapes.

The new command and hook AGENTS contracts persist naming, help/output and host lifecycle rules. Tests now separate unit layer contracts from CLI and collection integration. The superseded standalone executable files and aliases were removed because no external consumer was demonstrated. The existing portable package helpers are not a second CLI core and retain their independently distributable JavaScript runtime.

## SQLite tooling comparison

Reviewed the official documentation on 2026-09-15 against the current one-table observed-read ledger and future telemetry scope. This is a tooling decision, not a filename convention.

| Candidate | Concrete benefit | Fit and additional obligations |
| --- | --- | --- |
| [Knex](https://knexjs.org/guide/) and its [migrator](https://knexjs.org/guide/migrations) | Established query builder, up/down migrations, migration locking and CLI | Its documented SQLite clients use sqlite3 or better-sqlite3. SQLite schema-alteration transactions have explicit caveats; crashed migration locks can require manual unlock. Driver/package costs and current migration adoption need a separate compatibility rehearsal. |
| [Kysely](https://kysely.dev/docs/migrations) | Typed SQL query building, ordered migration providers and database-level serialization with crash-released locks | Its documented [SQLite driver interface](https://kysely-org.github.io/kysely-apidoc/interfaces/SqliteDatabase.html) follows better-sqlite3. Native Node SQLite reuse requires a verified dialect/adapter, not an assumed drop-in connection. It is the strongest candidate if typed queries and richer migrations become the central requirement. |
| [Drizzle Node SQLite](https://orm.drizzle.team/docs/get-started/node-sqlite-new) and [migrations](https://orm.drizzle.team/docs/migrations) | Typed schema/query model and generated SQL migrations; explicit support for existing node:sqlite DatabaseSync clients | The reviewed native-driver guide installs release-candidate ORM/Kit packages. Schema/SQL generation adds a development workflow and artifacts. Production package versions and checksum/history preservation need explicit validation before adoption. |

Decision for this bounded delivery: retain Node 24 DatabaseSync and SkillReadMigration, with tested immediate transactions, retry idempotence, concurrent writers and checksum rejection. No candidate eliminates the need for input/privacy rules, event identity or verified backup. Introducing an ORM now would add a second schema workflow for one simple table, while the useful telemetry model is still being designed. This is a scope-based decision, not a claim that custom migration code is generally superior. Reassess Kysely and Drizzle when implementing the normalized multi-event telemetry schema; preserve existing ledger data and checksum history in disposable upgrade/concurrency fixtures before changing the dependency or driver. No migration dependency, hidden code generator or native package installation was added.

## Original TypeScript consolidation checkpoint (historical)

These observations describe the initial migration, before packed distribution
and the subsequent command-registration correction. Current review and CI
evidence belongs to the exact delivery commit.

- Strict TypeScript and collection checks pass; 167 tests pass on the default runtime and Node 24.19.0.
- Repository hook verification reports matching configuration without executing/enabling the host hook. Only SessionStart is registered.
- Changeset status reports a minor change. Package dry-run includes the single bin launcher and TypeScript source; it is not proof of a node_modules installation or publication.
- Empty source/test directory scan returns none. Exact integrated commit review remains with the parent task; this work does not stage, commit or publish unrelated dirty changes.

## Verified removal and move manifest

| Previous path | Current owner |
| --- | --- |
| `src/application/validate-repository.mjs` | `src/service/CollectionValidationService.ts` |
| `src/application/validate-official.mjs` | `src/service/OfficialValidationService.ts` |
| `src/domain/collection-policy.mjs` | `src/validator/CollectionValidator.ts` |
| `src/domain/official-validator-policy.mjs` | `src/validator/OfficialValidator.ts` |
| `src/infrastructure/collection-filesystem.mjs` | `src/repository/CollectionFilesystemRepository.ts` |
| `src/infrastructure/official-validator-process.mjs` | `src/repository/OfficialValidatorProcessRepository.ts` |
| `src/application/render-session-index.mjs` | `src/service/AvailableSkillsService.ts` |
| `src/domain/session-index-policy.mjs` | `src/repository/SkillDiscoveryRepository.ts` |
| `src/infrastructure/skill-usage-store.mjs` | `src/repository/SkillReadRepository.ts` |
| `src/skill-usage-mcp.mjs` | `src/transport/SkillUsageMcpTransport.ts` |
| `src/skill-usage-mcp.md` | `src/command/mcp/UsageMcpCommand.md` |
| `src/cli.mjs` | `bin/index.mjs` |
| `tests/session-index.test.mjs` | `tests/unit/repository/SkillDiscoveryRepository.test.mjs`, `tests/integration/cli/available-skills.test.mjs`, `tests/unit/service/AvailableSkillsService.test.mjs`, `tests/unit/config/ProjectConfiguration.test.mjs` |
| `tests/official-validator.test.mjs` | `tests/unit/repository/official-validator-process.test.mjs`, `tests/unit/validator/official-validator.test.mjs` |
| `tests/skill-usage-mcp.test.mjs` | `tests/unit/repository/skill-read.test.mjs`, `tests/unit/migration/skill-read.test.mjs`, `tests/integration/cli/skill-usage-mcp.test.mjs`, `tests/integration/cli/skill-usage-concurrency.test.mjs` |
| `tests/aggregate-index.test.mjs` | `tests/integration/collection/aggregate-index.test.mjs` |
| `tests/catalog-tools.test.mjs` | `tests/integration/collection/catalog-tools.test.mjs` |
| `tests/distribution.test.mjs` | `tests/integration/collection/distribution.test.mjs` |
| `tests/host-compatibility.test.mjs` | `tests/integration/collection/host-compatibility.test.mjs` |
| `tests/html-links.test.mjs` | `tests/integration/collection/html-links.test.mjs` |
| `tests/repository.test.mjs` | `tests/integration/collection/repository.test.mjs` |
| `tests/skill-tools.test.mjs` | `tests/integration/collection/skill-tools.test.mjs` |

All listed old paths are absent and replacements exist. The deleted source wrappers had no demonstrated external consumers; no compatibility executable remains. The former application, domain, infrastructure and command/usage directories were removed only after confirming they were empty. The current source/test empty-directory scan returns none. Existing package helpers and unrelated dirty files are retained under their original ownership.

## Discovery and lifecycle naming

The repository reads installed package directories, so its class/file is SkillDiscoveryRepository rather than a catalog or session repository. AvailableSkillsService and AvailableSkillsInput describe the reusable overview; renderAvailableSkills performs discovery and renderOverview formats the result. `SessionIndexHookCommand` retains the lifecycle name, lives in `src/command/hook/SessionIndexHookCommand.ts`, and is explicitly registered as `hook:session-index`. Unit files now identify SkillDiscoveryRepository and AvailableSkillsService; CLI tests cover the reusable command and its lifecycle adapter together. No old naming aliases or executable entrypoints are retained.

## Catalog command group

Expose collection maintenance under `catalog`, separate from `context available-skills`. The latter discovers installed packages without writing a manifest; the catalog commands operate only on an explicitly selected collection and layout. Do not change SessionStart to synchronize catalogs.

| Command | Responsibility and effects |
| --- | --- |
| `catalog inspect --collection PATH --layout LAYOUT` | Read and validate the selected manifest; report its identity, package count and location as JSON. No write. |
| `catalog check --collection PATH --layout LAYOUT` | Compare the selected manifest with current package summaries through the existing checkCatalog helper. Staleness returns a nonzero status without modifying files. |
| `catalog sync --collection PATH --layout LAYOUT --dry-run` | Show the exact target and deterministic metadata differences without writing. The helper previews through its validated no-write branch. |
| `catalog sync --collection PATH --layout LAYOUT` | Explicitly update only that collection's skills-catalog.json through syncCatalog, preserving existing link/output checks and idempotence. No implicit home selection or package modification. |
| `catalog aggregate <operation>` | Implemented commands for derived multi-source current-state inspection and history-preserving writes. Require named source catalogs and an explicit output. Rebuild must preserve the existing reset-history boundary; do not conflate it with ordinary manifest sync. |

LAYOUT is `repository` or `global`; aggregate operations are `inspect`, `check`, `sync` and `rebuild`.

Use CollectionCatalogService to coordinate the operations and CollectionCatalogRepository to adapt the existing deterministic helper. Commands own flags/help/output only. Keep portable package helpers internally callable and independently distributable, while repository automation points at the unified CLI. No new executable script is needed.

Acceptance before implementation completion: command examples and error contracts; read-only inspection/check/preview; explicit write target reporting; idempotent sync; repository/global fixtures; duplicate/unsafe link rejection; no ambient HOME reads or writes; stale-manifest behavior; caller path with spaces; JSON/stdout discipline. Aggregate rebuild additionally needs loss-of-history prevention and preserved event/migration evidence tests. The catalog and aggregate command groups are implemented and fixture-tested, including no-write preview, staleness, linked-output rejection and retained SQLite history.

## Project configuration boundary

ProjectConfiguration under the singular config folder now resolves explicit root, environment override and checkout fallback once. It exposes root(), skillsDirectory(), codexHooksFile() and catalogFile() for one selected project. Empty/invalid paths fail instead of silently falling back. Relative paths resolve at construction, and later environment changes cannot move the selected project. This is lexical path configuration, not a claim that the directories exist, are canonical or are safe to write; repository adapters own filesystem trust checks.

AvailableSkillsService consumes the configured local skill directory. Command adapters use the same class for validation roots. Global discovery remains an explicit separate input with the existing command-level no-global/override contract; ProjectConfiguration does not read HOME. The previous service/project-root.ts function and test were removed, replaced by configuration unit tests and a service test proving source selection without filesystem access.

Project-configuration acceptance requires strict TypeScript, the complete test suite and local collection validation. The obsolete root helper and its former unit file are absent, with no empty source/test directories left behind.

## Pinned CLI formatting

Add Prettier 3.9.6 as an explicitly authorized development dependency. It replaces subjective formatting drift with one local formatter; it is not a runtime dependency, compiler or linter. The published engine requirement supports Node 24. No editor extension or runtime installation runs automatically.

Scope formatting to TypeScript in src, the bin launcher, unit tests, CLI integration tests and packaging tests. Exclude distributed skills, collection integration fixtures, generated files and prose from the formatting commands. Use four spaces, single quotes, semicolons, LF and a 100-column print-width preference; retain logical blank lines. JSON/YAML configuration uses two spaces, and Markdown prose wrapping is preserved when explicitly formatted outside these commands.

Provide format (explicit writes) and format:check (read-only), with the latter required by npm run check. Document editor use of the pinned local version. Validate the scoped formatter, strict types, complete behavioral suite, Changeset and diff. Removal is reversible through the package/lockfile dependency, scripts and configuration; it requires no data or runtime migration. Formatting must not alter fixture strings or expand into unrelated collection work.

The formatter adds one development package and no runtime dependency. Exact validation and commit evidence belong in the review record. No editor installation or host configuration change is part of formatting.
