# Skill authoring pipeline

Related foundation work: [Issue #1](https://github.com/i-9-ai/skills/issues/1).

## Outcome and scope

Build focused English, agent-agnostic skills: `skill-authoring`, `skills-discovery`, `skills-synthesis`, `skill-design`, `skill-evaluator`, and `skill-naming`. Each has one responsibility and one primary output. The creator coordinates discovery, selective synthesis, design, authoring, and evaluation through explicit file handoffs without duplicating specialist procedures, consulting naming when a name is unresolved. Each specialist is also usable independently. This PR starts the foundation; it does not complete Issue #1's consumer migration, release, or public distribution work.

## Design decision

Choose a coordinator with bounded stages rather than recursive skill calls or a provider-specific agent runtime. The coordinator passes the goal and constraints down and verifies artifacts on return. Specialists never call the coordinator. Skill design can refine an unclear brief before discovery and resolves synthesis tradeoffs before final authoring. No background scheduler is introduced.

Store canonical packages in `.agents/skills` for project self-use. Add only documented host aliases: `.github/skills` and `.claude/skills` to the canonical directory, and `CLAUDE.md` to `AGENTS.md`. Validate those exact aliases separately from untrusted package content, where symlinks remain forbidden. Verify Skills CLI discovery on the final layout.

Alternatives considered: a monolithic creator would duplicate specialist procedures and load unnecessary context; a mandatory subagent service would reduce portability and add credentials. Sequential execution is the reference path. Delegation is an optional capability with disjoint workspaces and the same output contract.

## Implementation sequence

1. Inspect the cited skills and alternatives on skills.sh. Resolve immutable source revisions, scoped licenses, full relevant package inventories, and adoption evidence. Record selected and rejected patterns in `docs/upstream-research.md` without private paths or snapshots.
2. Establish English repository guidance, security rules, catalog, compatibility claims, and authoring standards. Preserve the useful intake, disclosure, authority, evaluation, and rollback principles from existing practice without requiring a private harness.
3. Write the packages with narrow triggers, explicit inputs/outputs, local references, meaningful templates/examples, bounded iteration, safe failure behavior, and sequential/delegated handoffs. Keep independent behavioral evaluation in `skill-evaluator` and conditional naming decisions in `skill-naming`; reject a platform-wide skill when independent tasks have separate acceptance criteria. Group names by domain affinity and use singular/plural according to the task's primary unit.
4. Implement dependency-free Node.js helpers for scaffolding, skill validation, and verification of hashed run artifacts in owned stable workspaces. Keep repository tooling in `src/`, separating pure domain rules, application use cases, and filesystem/process infrastructure. Use a single `package.json` for commands and tool pins; implement synthetic Node regression tests and CI with read-only permissions and pinned actions.
   Include a full `LICENSE` in every package and scaffold. Keep descriptive metadata and body-explained reasoning preferences optional; use verified native host formats without confusing suggestions with model selection or tool authorization. Document OpenAI interface, policy, and MCP fields with checked source provenance. Capture upstream file/package hashes for future evolution; do not introduce an updater.
   Require official `skills-ref validate` for every new or changed skill. The workflow alone supplies Python for this external official tool, whose actual upstream source and dependency hashes are pinned in `package.json`. Custom local Node checks supplement official conformance, and unavailable matching official results block readiness.
5. Exercise a complete synthetic workflow plus negative, adversarial, and filesystem cases. Copy packages outside the source checkout and test read-only installed resources, directory aliases, an unrelated working directory, and separate outputs. Keep source-checkout commands and maintenance limits outside the distributed packages; declare separately installed companions. Record the limits of structural checks and model evaluation. Obtain an independent review on the exact committed diff; resolve pertinent findings before pushing and opening the English PR.

## Acceptance mapping

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Curated upstream basis | Research ledger and package provenance | Pinned sources, license inspection, selection/rejection reasons |
| Focused portable skills | `.agents/skills/*/SKILL.md` and local resources | Repository checks, scoped behavioral evidence, single-responsibility review |
| Independent package installation | Bundled resources, explicit caller workspace, separate companion resolution | Detached-package validation and helper execution in disposable project/global layouts |
| Explicit handoffs | Creator protocol, run example, validator | Ordered stages, hashes, failure and resume tests |
| Selective merger | Contribution matrix, conflict handling, source minimum | Complementary, duplicate, conflicting, and unsafe input scenarios |
| Secure reusable tooling | Node helpers, stable-workspace security policy | Temporary fixtures, traversal/symlink/no-overwrite and malformed-input tests |
| Official validation on every PR | Pinned `skills-ref`, Node runner, all-package workflow | Official check on every package and generated trial; missing/failing-tool regressions |
| Consistent discoverable names | Domain-first naming specialist and explicit local identities | Cardinality examples, scoped collision checks, optional naming handoff |
| Scalable collection | Catalog, contributor rules, README | Catalog/package agreement and local link checks |
| Honest readiness | Evaluation rubric and compatibility matrix | Separate structural, behavioral, provider, and production claims |
| Script-language premise | Local Node.js tooling and layered `src/`; official Python tool only in CI | Node regressions, one package.json, actual limits documented |
| Optional agent integration | Verified host matrix, Codex UI metadata, original icons | Adapter/resource checks and provider-free default scaffold |
| Reproducible evolution inputs | Upstream commits, file/package hashes, license evidence | Offline digest consistency and consumer validation |
| License and optional metadata | Per-package LICENSE, authorship/tags/provenance, explained reasoning hints | Metadata-free scaffold and catalog regression; native-field comparison; no automatic model selection |
| Reviewable delivery | Changelog and English PR | Exact commit checks and independent review |

## Release and rollback boundaries

The repository is written as public-ready from its first release. The owner selected Apache-2.0 for original content; third-party rights remain explicit regardless. No consumer is modified, no marketplace is published, and no upstream package is installed into a user's skill directory. Before merge, changes can be revised in this PR; after an authorized merge, prepare a revert PR or return consumers to their previous verified pin. Do not silently overwrite an evolved package when upstream changes.

## Executed amendments

This plan is the foundation migration record. Its original six-skill scope was implemented, then extended through the following versioned amendments rather than silently rewriting the initial decision.

| Amendment | Resulting change | Status |
| --- | --- | --- |
| Lifecycle expansion | Added the focused catalog, routing, evidence, security, installation, publication, migration, audit, refactoring, evolution, optimization, icon, and lifecycle-review capabilities, bringing the collection to 19 packages. | Implemented in this PR. |
| Portable authoring contract | Added explicit selection triggers, exclusions, context sources, handoffs, and conditional automation authority to the template and scaffold. | Implemented in this PR. |
| Lifecycle policy | Added portable `pilot`, `stable`, and `deprecated` decisions that follow the target project's existing evidence and approval system, or return an approval record when none exists. | Implemented in this PR. |
| [Changesets adoption](2026-09-13-adopt-changesets.md) | Added pending release-note and version-intent management without automated publication. | Implemented in this PR. |
| [Public Wiki mirror](2026-09-13-public-wiki.md) | Added a `main`-only mirror from `docs/` to the GitHub Wiki. | Implemented; first synchronization requires merge and `WIKI_SYNC_TOKEN`. |
| [Interactive visual guide](2026-09-13-publish-entry-path-map.md) | Added a generated entry-path map, README preview, and `gh-pages` publication workflow. | Implemented; first publication requires merge and GitHub Pages configuration. |

## Final implementation state

An agent reproducing this PR should execute the original sequence first, then apply the amendments in the table in order. The repository changes are complete when the collection contains 19 packages, the generated catalog agrees with them, the full local check passes, the official validation is configured in CI, the one pending Changeset covers the release candidate, and the public documentation points to the documented installation and pilot paths.

The following are deliberately not implementation-complete until their external prerequisites exist: official CI evidence for the exact merged revision, Wiki synchronization after `main` has `WIKI_SYNC_TOKEN`, GitHub Pages publication after `main` has the `gh-pages` workflow and Pages is enabled, a consumer pilot, release preparation, public visibility, and distribution. They are gates after this migration, not omissions from it.
