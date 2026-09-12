# Skill authoring pipeline

Related foundation work: [Issue #1](https://github.com/i-9-ai/skills/issues/1).

## Outcome and scope

Build five English, agent-agnostic skills: `skill-creator`, `find-skills`, `skills-merger`, `brainstorming`, and `skill-evaluator`. Each has one responsibility and one primary output. The creator coordinates discovery, selective synthesis, design, authoring, and evaluation through explicit file handoffs without duplicating specialist procedures. Each specialist is also usable independently. This PR starts the foundation; it does not complete Issue #1's consumer migration, release, or public distribution work.

## Design decision

Choose a coordinator with bounded stages rather than recursive skill calls or a provider-specific agent runtime. The coordinator passes the goal and constraints down and verifies artifacts on return. Specialists never call the coordinator. Brainstorming can refine an unclear brief before discovery and resolves synthesis tradeoffs before final authoring. No background scheduler is introduced.

Store canonical packages in `.agents/skills` for project self-use. Add only documented host aliases: `.github/skills` and `.claude/skills` to the canonical directory, and `CLAUDE.md` to `AGENTS.md`. Validate those exact aliases separately from untrusted package content, where symlinks remain forbidden. Verify Skills CLI discovery on the final layout.

Alternatives considered: a monolithic creator would duplicate specialist procedures and load unnecessary context; a mandatory subagent service would reduce portability and add credentials. Sequential execution is the reference path. Delegation is an optional capability with disjoint workspaces and the same output contract.

## Implementation sequence

1. Inspect the cited skills and alternatives on skills.sh. Resolve immutable source revisions, scoped licenses, full relevant package inventories, and adoption evidence. Record selected and rejected patterns in `docs/upstream-research.md` without private paths or snapshots.
2. Establish English repository guidance, security rules, catalog, compatibility claims, and authoring standards. Preserve the useful intake, disclosure, authority, evaluation, and rollback principles from existing practice without requiring a private harness.
3. Write the five packages with narrow triggers, explicit inputs/outputs, local references, meaningful templates/examples, bounded iteration, safe failure behavior, and sequential/delegated handoffs. Keep independent behavioral evaluation in `skill-evaluator`; reject a platform-wide skill when independent tasks have separate acceptance criteria.
4. Implement dependency-free Node.js helpers for scaffolding, skill validation, and verification of hashed run artifacts in owned stable workspaces. Keep repository tooling in `src/`, separating pure domain rules, application use cases, and filesystem/process infrastructure. Use a single `package.json` for commands and tool pins; implement synthetic Node regression tests and CI with read-only permissions and pinned actions.
   Include a full `LICENSE` in every package and scaffold, advisory model-profile metadata with evidence status, and optional documented host UI metadata/icons. Capture upstream file/package hashes for future evolution; do not introduce an updater.
   Require official `skills-ref validate` for every new or changed skill. The workflow alone supplies Python for this external official tool, whose actual upstream source and dependency hashes are pinned in `package.json`. Custom local Node checks supplement official conformance, and unavailable matching official results block readiness.
5. Exercise a complete synthetic workflow plus negative, adversarial, and filesystem cases. Record the limits of structural checks and model evaluation. Obtain an independent review on the exact committed diff; resolve pertinent findings before pushing and opening the English PR.

## Acceptance mapping

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Curated upstream basis | Research ledger and package provenance | Pinned sources, license inspection, selection/rejection reasons |
| Five focused portable skills | `.agents/skills/*/SKILL.md` and local resources | Repository checks, independent behavioral exercise, single-responsibility review |
| Explicit handoffs | Creator protocol, run example, validator | Ordered stages, hashes, failure and resume tests |
| Selective merger | Contribution matrix, conflict handling, source minimum | Complementary, duplicate, conflicting, and unsafe input scenarios |
| Secure reusable tooling | Node helpers, stable-workspace security policy | Temporary fixtures, traversal/symlink/no-overwrite and malformed-input tests |
| Official validation on every PR | Pinned `skills-ref`, Node runner, all-package workflow | Official check on all five packages and generated trial; missing/failing-tool regressions |
| Scalable collection | Catalog, contributor rules, README | Catalog/package agreement and local link checks |
| Honest readiness | Evaluation rubric and compatibility matrix | Separate structural, behavioral, provider, and production claims |
| Script-language premise | Local Node.js tooling and layered `src/`; official Python tool only in CI | Node regressions, one package.json, actual limits documented |
| Optional agent integration | Verified host matrix, Codex UI metadata, original icons | Adapter/resource checks and provider-free default scaffold |
| Reproducible evolution inputs | Upstream commits, file/package hashes, license evidence | Offline digest consistency and consumer validation |
| License and model guidance | Per-package LICENSE, advisory metadata | Scaffold/metadata regressions; no automatic model selection |
| Reviewable delivery | Changelog and English PR | Exact commit checks and independent review |

## Release and rollback boundaries

The repository remains private. The owner selected Apache-2.0 for original content; third-party rights remain explicit regardless. No consumer is modified, no marketplace is published, and no upstream package is installed into a user's skill directory. Before merge, changes can be revised in this PR; after an authorized merge, prepare a revert PR or return consumers to their previous verified pin. Do not silently overwrite an evolved package when upstream changes.
