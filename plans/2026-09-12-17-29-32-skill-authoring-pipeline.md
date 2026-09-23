# Skill authoring pipeline

Related foundation work: [Issue #1](https://github.com/i-9-ai/skills/issues/1).

## Outcome and scope

Build the inaugural collection of focused English, agent-agnostic skills. It includes the original authoring path (`skill-authoring`, `skills-discovery`, `skills-synthesis`, `skill-design`, `skill-evaluator`, and `skill-naming`) and the complementary lifecycle path for cataloging, routing, evidence collection, security review, lifecycle review, installation, publication, migration, auditing, refactoring, evolution, optimization, and icon design. Each has one responsibility and one primary output. The creator coordinates discovery, selective synthesis, design, authoring, and evaluation through explicit file handoffs without duplicating specialist procedures, consulting naming when a name is unresolved. Each specialist is also usable independently. The inaugural baseline includes the portable authoring and optional setup contracts; it does not complete consumer migration, package publication, registry submission, or a public release.

## Design decision

Choose a coordinator with bounded stages rather than recursive skill calls or a provider-specific agent runtime. The coordinator passes the goal and constraints down and verifies artifacts on return. Specialists never call the coordinator. Skill design can refine an unclear brief before discovery and resolves synthesis tradeoffs before final authoring. No background scheduler is introduced.

Store canonical packages in `.agents/skills` for project self-use. Add only documented host aliases: `.github/skills` and `.claude/skills` to the canonical directory, and `CLAUDE.md` to `AGENTS.md`. Validate those exact aliases separately from untrusted package content, where symlinks remain forbidden. Verify Skills CLI discovery on the final layout.

Alternatives considered: a monolithic creator would duplicate specialist procedures and load unnecessary context; a mandatory subagent service would reduce portability and add credentials. Sequential execution is the reference path. Delegation is an optional capability with disjoint workspaces and the same output contract.

## Implementation sequence

1. Inspect the cited skills and alternatives on skills.sh. Resolve immutable source revisions, scoped licenses, full relevant package inventories, and adoption evidence. Record selected and rejected patterns in `docs/Upstream Research.md` without private paths or snapshots.
2. Establish English repository guidance, security rules, catalog, compatibility claims, and authoring standards. Preserve the useful intake, disclosure, authority, evaluation, and rollback principles from existing practice without requiring a private harness.
3. Write the packages with narrow triggers, explicit inputs/outputs, local references, meaningful templates/examples, bounded iteration, safe failure behavior, and sequential/delegated handoffs. Keep independent behavioral evaluation in `skill-evaluator` and conditional naming decisions in `skill-naming`; reject a platform-wide skill when independent tasks have separate acceptance criteria. Group names by domain affinity and use singular/plural according to the task's primary unit. Provide lifecycle policy for pilot, stable, and deprecated decisions without granting automatic changes, approvals, installation, publication, or provider-specific behavior. Treat context efficiency as a measurable optimization objective: compare complete prose, table, Mermaid, code or schema, and on-demand reference representations against semantic coverage and task outcomes instead of assuming the shortest or most visual form is cheaper.
4. Implement dependency-free Node.js helpers for scaffolding, skill validation, and verification of hashed run artifacts in owned stable workspaces. Keep repository tooling in `src/`, separating pure domain rules, application use cases, and filesystem/process infrastructure. Use a single `package.json` for commands and tool pins; implement synthetic Node regression tests and CI with read-only permissions and pinned actions.
   Include a full `LICENSE` in every package and scaffold. Each newly scaffolded package states when to use it, when not to use it, authorized context sources, handoffs, and conditional automation authority. Add an optional, explicit prerequisites-and-setup contract: packages without setup stay dependency-free, while opted-in packages declare bounded relative entrypoints, idempotence, side effects, and a manual fallback. When a package needs configuration, define non-secret schema, validation, precedence, consumer-selected location, and fallback; secrets stay in the consumer's existing secret mechanism or explicit environment-variable interface. Keep descriptive metadata and body-explained reasoning preferences optional; use verified native host formats without confusing suggestions with model selection or tool authorization. Document OpenAI interface, policy, and MCP fields with checked source provenance. Capture upstream file/package hashes for future evolution; do not introduce an updater.
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
| Complete initial lifecycle | Focused lifecycle packages and maturity policy | Catalog agreement, package validation, policy tests, and explicit no-mutation boundaries |
| Portable authoring boundary | Template/scaffold sections for selection, context, handoffs, and automation authority | Scaffold regression, documentation links, and package-self-containment checks |
| Measured context efficiency | Representation guidance in design, authoring, and optimization packages | Frozen before-and-after context measure, semantic coverage, task score, and accessibility/compatibility floors |
| Optional setup contract | Explicit prerequisites, bounded setup metadata, and validation | Valid/no-setup/unsafe/incomplete declaration fixtures; no automatic execution |
| Caller configuration contract | Explicit non-secret configuration and secret boundary | Schema/validation where needed, redaction, no implicit discovery, and missing-prerequisite fallback |
| Reviewable delivery | Changelog and English PR | Exact commit checks and independent review |

## Self-sufficient task route acceptance

Refine the inaugural design, authoring, evolution, optimization, and evaluation contracts so an installed package teaches ordinary work without relying on model prior knowledge or external lookup. Keep a complete normal example in the entrypoint when it enables immediate implementation; route independently needed topics to focused bundled references with explicit loading conditions. Keep tightly coupled information together when ordinary tasks almost always need it together. Choose layout from co-usage, completeness, measured context cost, and navigation overhead, never mechanically from file length.

Preserve useful reviewed source procedures, decisions, exceptions, and examples when adapting a template; document any justified removal. Treat suggested character, line, and token budgets as advisory quality controls, separately from actual specification/schema limits and verified collection validation bounds. If a required bound constrains an entrypoint, retain necessary content in reachable task-specific resources rather than omitting it.

Illustrative code-facing acceptance: a Symfony Console route explains prerequisites, file layout, command creation and registration, arguments/options, dependency injection and wiring, output/error handling and exit statuses, invocation, and CommandTester checks. This is an acceptance example, not a claim that a Symfony implementation or benchmark has been executed here.

Validate changed packages with the official tool, repository checks, Changeset status, and whitespace checks. Inspect ordinary and conditional routes for missing steps and misleading evaluation claims. A benchmark requires recorded executions and observations; cases, scaffolds, and structural validation alone are not benchmark results. Obtain independent review on the exact commit. This refinement does not change parsers, provider integrations, recovery storage, host links, or publication authority. Rollback consists of reverting only this focused contract change while preserving concurrent work.

## Domain-research consolidation

Before the first release, this plan also absorbs mandatory `skill-domain-research` because it completes the same inaugural authoring boundary. The version 2 run contract inserts domain research between discovery and synthesis. It must preserve the user process owner as the source for current practice while reconciling that record with opened current authoritative public sources, recording jurisdiction, date, conflicts, unknowns, and qualified-human gates for any case-specific professional determination. The dossier supports authoring; it is not a substitute for the qualified determination or advice. Synthesis may use one contributing skill package plus the required dossier, or be explicitly skipped only when there is no contributor. Update the run schema, helper, tests, documentation, catalog, and Changeset together; reject historical version 1 manifests as current readiness evidence. Rollback restores the prior six-stage contract and removes the domain-research package, catalog entry, documentation, tests, and Changeset as one reviewed change.

## Installation fallback completion

Complete the inaugural installation boundary identified in [PR review comment 4010639762](https://github.com/i-9-ai/skills/pull/2#discussion_r4010639762). Bundle a dependency-free Node helper and a complete usage/recovery reference inside `skill-installation`. Read only committed package bytes from a caller-selected local Git repository at a full commit ID. Stage outside discovery, reject unsafe entries, run the caller's explicitly selected official validator, and bind installation and read-back verification to a deterministic content digest. Refuse collisions by default; explicit replacement must retain the prior bytes and a recovery receipt outside discovery on the same filesystem.

The helper never fetches sources, installs dependencies, runs package setup, manages host aliases, or changes an actual consumer during repository tests. Source retrieval and official-tool preparation remain explicit, documented prerequisites with immutable provenance. Exercise detached installation, validation failure, source/path rejection, collision preservation, replacement, rollback, and changed-destination rejection using disposable repositories and a fake validator. Fake-tool tests prove orchestration only; actual official validation remains required for the modified package on the final PR head. Revert the helper, its reference/tests, entrypoint additions, and Changeset together to remove this fallback without affecting any existing installation receipts.

## Release and rollback boundaries

The repository is written as public-ready from its first release. The owner selected Apache-2.0 for original content; third-party rights remain explicit regardless. No consumer is modified, no marketplace is published, and no upstream package is installed into a user's skill directory. Before merge, changes can be revised in this PR; after an authorized merge, prepare a revert PR or return consumers to their previous verified pin. Do not silently overwrite an evolved package when upstream changes.

## Inaugural baseline consolidation

Before the first release, this plan absorbed the lifecycle expansion, portable authoring contract, and portable runtime/setup contract because they complete the same collection-level acceptance boundary. Their original records remain in Git and in this directory as decision provenance; they are not separate released increments.
