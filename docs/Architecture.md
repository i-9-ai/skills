# Architecture

## Current entry paths

The portable packages, prepared CLI and repository-root plugin are separate
entry paths into the same collection. The CLI starts from `bin/index.mjs`;
native plugin adapters start local transports directly, without preparing the
CLI or fetching dependencies during a host event.

```mermaid
flowchart LR
    Task[User task] --> Native[Host skill discovery]
    Native --> Read[Selected SKILL.md and references]
    Git[Reviewed Git-source npx] --> CLI[i9-skills CLI]
    CLI -->|catalog search / read / overview| Catalog[Bundled catalog]
    CLI -->|mcp serve| MCP[Local stdio MCP]
    Root[Repository-root plugin] --> Host[Codex / Claude / Copilot manifests]
    Host -->|native stdio| MCP
    Host -->|Codex / Claude SessionStart| Hook[Local Node 24 hook]
    Hook --> Context[Bounded metadata context]
    MCP -->|catalog tools| Catalog
    Catalog --> Read
    Read --> Work[Portable meta-skill workflow]
```

The Git-source `npx` call downloads a reviewed immutable revision and runs its
explicit preparation lifecycle; registry `npx @i-9-ai/skills` still requires npm
publication. Hook context discovers plugin, project and global packages. MCP
catalog access uses the installed bundled catalog and returns selected Markdown.
Neither context nor retrieval activates a skill or records evidence. The CLI
also exposes explicit collection maintenance, observations, reports and evidence
queries; the MCP exposes the catalog, onboarding, bump reports and explicit
evidence tools. See [CLI distribution](https://github.com/i-9-ai/skills/wiki/Distribution-Readiness),
[plugin preparation](https://github.com/i-9-ai/skills/wiki/Plugin-Preparation) and
the [interactive entry-path map](https://i-9-ai.github.io/skills/skill-management-entry-paths.html).

## Responsibility boundaries

The collection is organized around independently useful tasks, not vendors or platforms. The skills own discovery, synthesis, design, authoring, evaluation, and naming. `skill-authoring` is the entrypoint for producing a package and only coordinates the other procedures. `skills-synthesis` produces the synthesis contract; it does not also search the web, author code, or grade its own output. `skill-naming` owns open naming decisions and returns a report without renaming files.

For example, a GitHub collection might separate CLI command selection, issue preparation, pull request delivery, action usage, and workflow authoring when their outcomes and acceptance criteria differ. This illustrates the general responsibility test rather than prescribing domain categories. Keep cohesive steps together when splitting them would create no independently useful capability.

## Repository tooling layers

The checkout CLI runs on Node.js 24 with pinned oclif and erasable TypeScript. `package.json` centralizes dependencies and the official tool pins. Run `npm ci` explicitly before local checks. The creator's self-contained helper remains inside its package.

```mermaid
flowchart LR
    Bin[bin/index.mjs] --> Command[command]
    Command --> Config[config]
    Command --> Service[service]
    Service --> Validator[validator]
    Service --> Repository[repository]
    Repository --> Migration[migration]
    Service --> Transport[transport]
    Repository --> Packages[Canonical skill packages]
```

| Layer | Responsibility |
| --- | --- |
| CLI | Select a use case, present results, and set the process exit status |
| config | Resolve named paths, command routes and runtime options without I/O |
| service | Coordinate validation, discovery, maintenance, evidence queries and reports |
| validator | Reusable catalog, provenance, public-hygiene and official-source checks |
| repository | Filesystem/process access, installed resources and separate evidence aggregates |
| migration | Ordered checksum-verified SQLite schema history |
| transport | Bounded MCP protocol handling |

Validators do not launch processes or read files. Services coordinate validators and repositories; commands own parsing/output. A thin `bin/index.mjs` launches the CLI. The [source index](https://github.com/i-9-ai/skills/blob/main/src/AGENTS.md) records these boundaries. Python is installed only by the workflow for the upstream `skills-ref` command; no repository-owned validation logic is implemented in Python.

## Execution contract

The [creator's handoff protocol](https://github.com/i-9-ai/skills/blob/main/.agents/skills/skill-authoring/references/handoff-protocol.md) owns the run format. Specialists can be installed and used alone through their local inputs/outputs; they need no repository root files. The creator locates separately available companions through the host's inventory or trusted explicit paths and wraps their returned artifacts in ordered stages with SHA-256 evidence. Resource paths belong to the installed package; outputs belong to the caller's selected workspace.

Stages are intake → discovery → domain-research → conditional synthesis → design → authoring → evaluation. The creator may consult `skill-design` within intake before discovery when clarification is needed; that preliminary brief does not replace the final design stage. Domain research always opens current public authoritative sources relevant to the proposed skill's subject and preserves the process-owner record, scope, date, conflicts, and unknowns. With no contributing skill package, synthesis is skipped with evidence. With one contributing package, its useful contributions go directly to design alongside the research dossier. Synthesis compares two or more distinct contributing packages. Mirrors and revisions of the same source do not fill the contribution requirement.

```mermaid
flowchart LR
    Intake --> Discovery --> Research[Domain research]
    Research --> Count{Distinct contributing<br/>skill packages}
    Count -->|none| Design
    Count -->|one| Design
    Count -->|two or more| Synthesis --> Design
    Design --> Authoring --> Evaluation
```

Every stage returns its result, evidence, limitations, and next consumer. The coordinator verifies the output before continuing. Changed inputs invalidate dependent stages. Missing capability, rights, authority, or critical test evidence produces a blocked handoff. Correction loops default to two rounds; the intake can set a different justified budget.

The manifest is an audit artifact, not an executable workflow engine. Its status is an assertion supported by reports; integrity checks cannot certify that prose is true. It grants no tool authority and starts no subprocesses, models, schedulers, or background jobs.

Naming is conditional intake/design work, not a seventh run stage. Names group by domain affinity, with cardinality reflecting the primary unit. A naming report records the selected identifier, alternatives, known collisions, and affected consumers; the authoring coordinator applies an accepted rename.

## Optional delegation

One agent reading the relevant packages in sequence is the reference execution. Where supported and authorized, independent candidate inspections and evaluation cases may run concurrently in isolated workspaces. Workers receive the minimal brief, raw inputs, output contract, and action scope. They do not own shared mutable state or remote publication. The creator reconciles disagreements and verifies returned artifacts.

No runtime adapter is required for a distributed package. Optional Codex UI metadata and local icons accompany the packages; they do not execute a workflow or change the core. The project-local session-index adapter is separate: it renders bounded entry context from current project/global package metadata when a trusted host runs it, using `context available-skills` through `hook session-index`. It neither loads package bodies nor changes selection, installation, or execution authority. Resolve companion skills by the selected package set and identity; installed name collisions require explicit resolution. If a required package is missing, preserve completed work and name the missing capability rather than pretending that its stage ran.

The repository-root plugin has a dependency-free Node 24 hook transport. Host
manifests select native adapters; the common discovery repository receives a
metadata parser appropriate to the runtime. The prepared CLI uses full YAML;
the installed plugin uses the package-owned subset and reports incomplete
coverage. Context and observed-read persistence have independent failure paths.

```mermaid
flowchart LR
    Codex[Codex SessionStart] --> Runner[PluginHookRunner]
    Claude[Claude SessionStart] --> Runner
    Read[Claude native Read attempt / success] --> Runner
    Runner --> Discovery[Shared skill discovery]
    Collections[Plugin / project / global packages] --> Discovery
    Discovery --> Overview[Bounded host context]
    Runner -->|verified Claude observations| Telemetry[Shared telemetry service]
    Telemetry --> Data[Host-owned plugin data]
```

Data stays outside installed bytes and the consumer project. A storage failure
does not suppress the available-skills overview. Read observations are counts,
not evidence of activation or a separate source of skill instructions. Native
host trust and event delivery require their own consumer tests; direct transport
tests and manifest validation establish a narrower boundary.

## Installed MCP and read-only guidance

The CLI's `catalog search/read/overview` operations and `mcp serve` share one
bundled-catalog service. Installed module location selects the package, while
existing catalog validation checks declared identity and freshness. Retrieval
serves only `SKILL.md` or bounded Markdown references in the selected package;
it does not use project/global discovery or execute scripts. The same MCP
dispatcher also serves pure change reports and installed onboarding data. Explicit
records and metrics use a separate evidence store described below.

```mermaid
flowchart LR
    CLI[Catalog commands] --> Catalog[SkillCatalogService]
    Hosts[Codex / Claude / Copilot MCP manifests] --> Plugin[PluginMcpServer]
    Plugin --> MCP[Shared MCP dispatcher]
    Serve[mcp serve] --> MCP
    MCP -->|search / read / overview| Catalog
    Catalog --> Installed[InstalledSkillRepository]
    Installed --> Validation[Existing catalog and file contracts]
    Validation --> Bundled[Bundled catalog and skill resources]
    MCP -->|bump report| Bump[SkillBumpReportService]
    ReportCLI[skills report bump] --> Bump
    Bump --> Recommendation[Recommendation or undetermined]
    MCP -->|onboarding| Onboarding[SkillOnboardingService]
    GuideCLI[skills onboarding] --> Onboarding
    Onboarding --> Guide[Versioned command data and examples]
```

Protocol initialization, catalog reads, bump reports and onboarding create no
evidence database. Onboarding returns instructions; it never executes them.
Catalog access never implies a read observation or activation. Responses distinguish
package version, catalog/content digests and unavailable Git provenance; none is
silently substituted for another. See the [MCP contract](https://github.com/i-9-ai/skills/wiki/Skill-MCP).

## Explicit lifecycle and catalog evidence

The dedicated evidence database retains observed reads, explicitly reported
lifecycle outcomes and complete caller-reported catalog inventories. It is
separate from the rebuildable multi-collection catalog index. CLI and MCP
operations use the same validation and storage contracts.

```mermaid
flowchart LR
    Records[Explicit read / lifecycle / catalog records] --> Validate[Validate identity and event contract]
    Validate --> Writer[Transactional writer and ordered migrations]
    Writer --> Store[Dedicated evidence database]
    Queries[Explicit metric queries] --> Reader[Read-only compatible-schema access]
    Store --> Reader
    Reader --> Reports[Rankings / outcomes / overlap / inactivity / history]
    Memory[Explicit skill memory inspection] --> Reader
    Reader --> Inspection[Compact summaries / cutoff counts]
```

A valid explicit record may initialize or upgrade the selected store. Queries
require existing compatible state and never create or migrate it. Retries retain
event identity; changed content or conflicting attempt stages fail instead of
overwriting history. Aggregate-index reset and rebuild operations reject this
database.

A host read observation is not an activation. Lifecycle records are emitter
assertions, catalog observations assert a complete inventory, and neither proves
successful execution or semantic quality. Metrics expose their denominators,
periods and missing coverage. No reported activity does not prove non-use. See
[lifecycle evidence](https://github.com/i-9-ai/skills/wiki/Lifecycle-Evidence) for event ordering, query budgets
and recovery, and [telemetry](https://github.com/i-9-ai/skills/wiki/Skill-Telemetry) for observed-read handling.

[Skill memory inspection](https://github.com/i-9-ai/skills/wiki/Skill-Memory) composes these projections in one
read snapshot. Summaries retain evidence identity and missing coverage; retention
inspection counts records around an optional caller cutoff within the queried
period. Neither operation establishes a retention policy, evaluates historical
dependencies for deletion, or writes to the database.

## Skill observations and version decisions

Snapshot observations and bump reports do not use the telemetry database.
`skills observe` verifies an existing schema-2 snapshot and exports a bounded
portable inventory with separately supplied source and check evidence. It does
not capture or restore a snapshot. The report compares two such observations and
requires an explicit semantic review of changed files and contracts.

```mermaid
flowchart LR
    Snapshot[Existing verified snapshot] --> Observe[skills observe]
    Evidence[Caller-supplied source and check evidence] --> Observe
    Observe --> Inventory[Portable observation]
    Before[Before observation] --> Compare[skills report bump or MCP tool]
    Inventory --> Compare
    Review[Explicit file and contract review] --> Compare
    Compare --> Decision[Patch / minor / major / undetermined]
    Decision -.->|Maintainer decision| Changeset[Changeset release intent]
    Changeset -.->|Explicit version-preparation task| Prepare[Aligned release files for review]
```

Content identity alone cannot establish compatibility or a release category.
Incomplete, conflicting or insufficient evidence stays `undetermined`; a report
neither changes package versions nor creates release notes. An accepted result
may inform a separately authored Changeset. The version-preparation command then
updates release artifacts only when explicitly invoked; tags and publication
remain separate actions. See [skill change reports](https://github.com/i-9-ai/skills/wiki/Skill-Change-Reports)
and [release management](https://github.com/i-9-ai/skills/wiki/Release-Management).

## Explicit collection maintenance

The optional CLI composes package-owned validation, catalog derivation and
snapshots into a deterministic audit/plan/application workflow. It does not run
a model or transform semantic instructions. Plans bind to the selected collection
and its exact inspected state; application previews unless explicitly requested.

```mermaid
flowchart LR
    Audit[collection audit] --> Findings[Bounded findings and baseline]
    Findings --> Plan[collection plan]
    Plan --> Handoffs[Pending semantic handoffs]
    Plan --> Preview[collection evolve preview]
    Preview -->|explicit apply and current baseline| Recovery[Snapshot and restore proof]
    Recovery --> Sync[Atomic catalog sync]
    Sync --> Verify[Verify catalog and unchanged packages]
    Verify -->|failure| Rollback[Restore catalog preimage]
    Verify -->|success| Receipt[Result and remaining handoffs]
    Rollback --> Receipt
```

Only catalog synchronization is supported automatically. Malformed catalogs and
package content changes retain their own handoffs. Recovery captures only the
catalog preimage, not an entire repository. See [collection maintenance](https://github.com/i-9-ai/skills/wiki/Collection-Maintenance)
for explicit selections, limits and receipt semantics.

## Provenance and evolution

[upstreams.lock.json](https://github.com/i-9-ai/skills/blob/main/upstreams.lock.json) contains benchmark source identity and digests; [the research ledger](https://github.com/i-9-ai/skills/wiki/Upstream-Research) connects sources to retained and rejected ideas. The source commit locates a revision; the package digest identifies the captured file set, and per-file digests locate changes. Applicable license bytes are recorded separately when the license lives outside the package.

The skill-evolution package can resolve a new upstream revision, capture it under the same rules, compare added, changed, and removed files, and map differences to local contributions. It must distinguish improvements, already covered behavior, irrelevant changes, regressions, and license changes, then propose a bounded change with tests and a PR. Measured candidate improvement belongs to skill-optimization, which requires frozen splits, bounded edits, and a held-out gate. Hashes do not rank quality. No updater or monitor silently replaces accepted skills.

## Collection lifecycle

The canonical project path is `.agents/skills`. The Skills CLI explicitly searches it in the [inspected discovery implementation](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/skills.ts). Repository aliases `.github/skills` and `.claude/skills` point to that directory, and `CLAUDE.md` plus `GEMINI.md` point to `AGENTS.md`. They exist for host discovery, not backward compatibility with an obsolete internal layout. Validators recognize only these exact aliases at the repository boundary; symlinks inside skill packages remain forbidden.

The catalog is a derived package inventory. The Git revision identifies the collection version; do not embed a self-referential HEAD hash in the catalog. Lifecycle evidence and decisions remain separate review records. A future consumer should pin an approved immutable revision and verify the selected package bytes in its own installation workflow. Releases, consumer migrations, and visibility changes require their own authorized delivery evidence.

A caller that needs to compare several explicitly selected collections uses the separate `skills-catalog-index` package to build a local derived `skills-catalog.db` from their validated `skills-catalog.json` manifests. Canonical inventory generation remains in `skills-catalog`. The aggregate is outside all source repositories, records logical source identifiers and catalog digests rather than local paths, and retains timestamped source observations plus normalized before/after skill changes. Its current source and skill tables remain a deterministic projection. The `skills-catalog.index.json` fallback provides the same current projection without history. These local indexes are not canonical catalogs, directory scanners, installers, activators, or source updaters.

Follow the [lifecycle policy](https://github.com/i-9-ai/skills/wiki/Lifecycle-Policy) to evaluate maturity through the target project's existing evidence and approval system, or a portable approval record when none exists. Catalog presence does not assign a lifecycle state. Upstream benchmarking and local structural validation are prerequisites, not proof of production operation.

Recurring collection maintenance begins with `skills-maintenance-scheduling`. It freezes an explicit package inventory and revision, inspects only project-local scheduling and approval mechanisms, and returns a cadence proposal with the real executor, evidence owner, stop condition, and rollback path. The default is advisory. Even when scheduler configuration is separately authorized, scheduled runs remain limited to proposing work or collecting read-only evidence; they cannot approve, modify, install, merge, or publish a skill.
