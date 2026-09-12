# Architecture

## Responsibility boundaries

The collection is organized around independently useful tasks, not vendors or platforms. The initial five skills own discovery, synthesis, design, authoring, and evaluation respectively. `skill-creator` is the entrypoint for producing a package and only coordinates the other procedures. `skills-merger` produces the synthesis contract; it does not also search the web, author code, or grade its own output.

An entire GitHub workflow is not one skill merely because it uses one API. CLI command selection, issue preparation, pull request delivery, action usage, and workflow authoring should have separate skills when their outputs and acceptance boundaries differ. Keep cohesive steps together when splitting them would create no independently useful capability.

## Execution contract

The [creator's handoff protocol](../.agents/skills/skill-creator/references/handoff-protocol.md) owns the run format. Specialists can be used alone through their local inputs/outputs; they need no repository root files. The creator wraps their returned artifacts in ordered stages with SHA-256 evidence.

Stages are intake → discovery → synthesis → design → authoring → evaluation. The creator may consult brainstorming within intake before discovery when clarification is needed; that preliminary brief does not replace the final design stage. With fewer than two contributing sources, synthesis is skipped with evidence. A passed synthesis must select useful contributions from distinct packages; mirrors and revisions of the same source cannot fill the minimum.

Every stage returns its result, evidence, limitations, and next consumer. The coordinator verifies the output before continuing. Changed inputs invalidate dependent stages. Missing capability, rights, authority, or critical test evidence produces a blocked handoff. Correction loops default to two rounds; the intake can set a different justified budget.

The manifest is an audit artifact, not an executable workflow engine. Its status is an assertion supported by reports; integrity checks cannot certify that prose is true. It grants no tool authority and starts no subprocesses, models, schedulers, or background jobs.

## Optional delegation

One agent reading the relevant packages in sequence is the reference execution. Where supported and authorized, independent candidate inspections and evaluation cases may run concurrently in isolated workspaces. Workers receive the minimal brief, raw inputs, output contract, and action scope. They do not own shared mutable state or remote publication. The creator reconciles disagreements and verifies returned artifacts.

No runtime adapter is required. Optional Codex UI metadata and local icons accompany the packages; they do not execute a workflow or change the core. Resolve companion skills by the selected package set and identity; installed name collisions require explicit resolution. If a required package is missing, preserve completed work and name the missing capability rather than pretending that its stage ran.

## Provenance and evolution

[upstreams.lock.json](../upstreams.lock.json) contains benchmark source identity and digests; [the research ledger](upstream-research.md) connects sources to retained and rejected ideas. The source commit locates a revision; the package digest identifies the captured file set, and per-file digests locate changes. Applicable license bytes are recorded separately when the license lives outside the package.

A future evolution skill can resolve a new upstream revision, capture it under the same rules, compare added/changed/removed files, and map differences to local contributions. It must distinguish improvements, already covered behavior, irrelevant changes, regressions, and license changes, then propose a bounded change with tests and a PR. Hashes do not rank quality. No updater, monitor, or `skills-evolution` runtime is included here.

## Collection lifecycle

The canonical project path is `.agents/skills`. The Skills CLI explicitly searches it in the [inspected discovery implementation](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/skills.ts). Repository aliases `.github/skills` and `.claude/skills` point to that directory, and `CLAUDE.md` points to `AGENTS.md`. They exist for host discovery, not backward compatibility with an obsolete internal layout. Validators recognize only these exact aliases at the repository boundary; symlinks inside skill packages remain forbidden.

The catalog is the package inventory and maturity record. The Git revision identifies the collection version; do not embed a self-referential HEAD hash in the catalog. A future consumer should pin an approved immutable revision and verify the selected package bytes in its own installation workflow. Releases, consumer migrations, and visibility changes require their own authorized delivery evidence.

Initial packages are pilots. Promotion requires repeated useful behavioral outcomes, no critical blockers, maintainer review, and recorded environments. Upstream benchmarking and local structural validation are prerequisites, not proof of production operation.
