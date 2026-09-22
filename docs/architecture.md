# Architecture

## Responsibility boundaries

The collection is organized around independently useful tasks, not vendors or platforms. The skills own discovery, synthesis, design, authoring, evaluation, and naming. `skill-authoring` is the entrypoint for producing a package and only coordinates the other procedures. `skills-synthesis` produces the synthesis contract; it does not also search the web, author code, or grade its own output. `skill-naming` owns open naming decisions and returns a report without renaming files.

For example, a GitHub collection might separate CLI command selection, issue preparation, pull request delivery, action usage, and workflow authoring when their outcomes and acceptance criteria differ. This illustrates the general responsibility test rather than prescribing domain categories. Keep cohesive steps together when splitting them would create no independently useful capability.

## Repository tooling layers

The checkout CLI runs on Node.js 24 with pinned oclif and erasable TypeScript. `package.json` centralizes dependencies and the official tool pins. Run `npm ci` explicitly before local checks. The creator's self-contained helper remains inside its package.

| Layer | Responsibility |
| --- | --- |
| CLI | Select a use case, present results, and set the process exit status |
| service | Coordinate collection validation, context discovery and MCP startup |
| validator | Reusable catalog, provenance, public-hygiene and official-source checks |
| repository | Filesystem/process access and the observed-read aggregate with derived rankings |
| migration | Ordered checksum-verified SQLite schema history |
| transport | Bounded MCP protocol handling |

Validators do not launch processes or read files. Services coordinate validators and repositories; commands own parsing/output. A thin `bin/index.mjs` launches the CLI. The [source index](../src/AGENTS.md) records these boundaries. Python is installed only by the workflow for the upstream `skills-ref` command; no repository-owned validation logic is implemented in Python.

## Execution contract

The [creator's handoff protocol](../.agents/skills/skill-authoring/references/handoff-protocol.md) owns the run format. Specialists can be installed and used alone through their local inputs/outputs; they need no repository root files. The creator locates separately available companions through the host's inventory or trusted explicit paths and wraps their returned artifacts in ordered stages with SHA-256 evidence. Resource paths belong to the installed package; outputs belong to the caller's selected workspace.

Stages are intake → discovery → domain-research → synthesis → design → authoring → evaluation. The creator may consult `skill-design` within intake before discovery when clarification is needed; that preliminary brief does not replace the final design stage. Domain research always opens current public authoritative sources relevant to the proposed skill's subject and preserves the process-owner record, scope, date, conflicts, and unknowns. With no contributing skill package, synthesis is skipped with evidence; with one or more distinct contributing packages, it selects useful contributions against the required research dossier. Mirrors and revisions of the same source do not fill the contribution requirement.

Every stage returns its result, evidence, limitations, and next consumer. The coordinator verifies the output before continuing. Changed inputs invalidate dependent stages. Missing capability, rights, authority, or critical test evidence produces a blocked handoff. Correction loops default to two rounds; the intake can set a different justified budget.

The manifest is an audit artifact, not an executable workflow engine. Its status is an assertion supported by reports; integrity checks cannot certify that prose is true. It grants no tool authority and starts no subprocesses, models, schedulers, or background jobs.

Naming is conditional intake/design work, not a seventh run stage. Names group by domain affinity, with cardinality reflecting the primary unit. A naming report records the selected identifier, alternatives, known collisions, and affected consumers; the authoring coordinator applies an accepted rename.

## Optional delegation

One agent reading the relevant packages in sequence is the reference execution. Where supported and authorized, independent candidate inspections and evaluation cases may run concurrently in isolated workspaces. Workers receive the minimal brief, raw inputs, output contract, and action scope. They do not own shared mutable state or remote publication. The creator reconciles disagreements and verifies returned artifacts.

No runtime adapter is required for a distributed package. Optional Codex UI metadata and local icons accompany the packages; they do not execute a workflow or change the core. The project-local session-index adapter is separate: it renders bounded entry context from current project/global package metadata when a trusted host runs it, using `context available-skills` through `hook session-index`. It neither loads package bodies nor changes selection, installation, or execution authority. Resolve companion skills by the selected package set and identity; installed name collisions require explicit resolution. If a required package is missing, preserve completed work and name the missing capability rather than pretending that its stage ran.

## Provenance and evolution

[upstreams.lock.json](../upstreams.lock.json) contains benchmark source identity and digests; [the research ledger](upstream-research.md) connects sources to retained and rejected ideas. The source commit locates a revision; the package digest identifies the captured file set, and per-file digests locate changes. Applicable license bytes are recorded separately when the license lives outside the package.

The skill-evolution package can resolve a new upstream revision, capture it under the same rules, compare added, changed, and removed files, and map differences to local contributions. It must distinguish improvements, already covered behavior, irrelevant changes, regressions, and license changes, then propose a bounded change with tests and a PR. Measured candidate improvement belongs to skill-optimization, which requires frozen splits, bounded edits, and a held-out gate. Hashes do not rank quality. No updater or monitor silently replaces accepted skills.

## Collection lifecycle

The canonical project path is `.agents/skills`. The Skills CLI explicitly searches it in the [inspected discovery implementation](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/skills.ts). Repository aliases `.github/skills` and `.claude/skills` point to that directory, and `CLAUDE.md` plus `GEMINI.md` point to `AGENTS.md`. They exist for host discovery, not backward compatibility with an obsolete internal layout. Validators recognize only these exact aliases at the repository boundary; symlinks inside skill packages remain forbidden.

The catalog is a derived package inventory. The Git revision identifies the collection version; do not embed a self-referential HEAD hash in the catalog. Lifecycle evidence and decisions remain separate review records. A future consumer should pin an approved immutable revision and verify the selected package bytes in its own installation workflow. Releases, consumer migrations, and visibility changes require their own authorized delivery evidence.

A caller that needs to compare several explicitly selected collections uses the separate `skills-catalog-index` package to build a local derived `skills-catalog.db` from their validated `skills-catalog.json` manifests. Canonical inventory generation remains in `skills-catalog`. The aggregate is outside all source repositories, records logical source identifiers and catalog digests rather than local paths, and retains timestamped source observations plus normalized before/after skill changes. Its current source and skill tables remain a deterministic projection. The `skills-catalog.index.json` fallback provides the same current projection without history. These local indexes are not canonical catalogs, directory scanners, installers, activators, or source updaters.

Follow the [lifecycle policy](lifecycle-policy.md) to evaluate maturity through the target project's existing evidence and approval system, or a portable approval record when none exists. Catalog presence does not assign a lifecycle state. Upstream benchmarking and local structural validation are prerequisites, not proof of production operation.

Recurring collection maintenance begins with `skills-maintenance-scheduling`. It freezes an explicit package inventory and revision, inspects only project-local scheduling and approval mechanisms, and returns a cadence proposal with the real executor, evidence owner, stop condition, and rollback path. The default is advisory. Even when scheduler configuration is separately authorized, scheduled runs remain limited to proposing work or collecting read-only evidence; they cannot approve, modify, install, merge, or publish a skill.
