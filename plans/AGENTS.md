# Plans

## Purpose
Keep reproducible implementation recipes for architectural changes.

## Ownership
Maintainers own plans; current contracts and code take precedence over historical intent.

## Local contracts
Write in English. Link the related issue, scope, acceptance criteria, verification, and rollback. Before the first release, maintain one coherent inaugural baseline: fold a later refinement into its originating plan when it completes the same acceptance boundary and has no independently deployable interface, workflow, or rollback. Preserve the absorbed plan in Git with an explicit consolidation note for decision provenance. Create a separate UTC-timestamped plan when a decision adds a distinct scope, dependency, workflow, external boundary, or independently reviewable rollout. After the first release, treat each material plan as an immutable migration record.

## Work guidance
Before the first release, update the originating baseline rather than keep artificial increments for the same initial outcome. After release, do not rewrite an earlier plan to absorb a later material decision. Name plans `YYYY-MM-DD-HH-mm-ss-meaningful-slug.md` in UTC, so lexical order reflects creation time. If two plans are created in the same second, use `-01`, `-02`, and so on before the slug. Never rename a committed plan merely to fill a gap or change its timestamp. Routine wording corrections that do not change intent may update the current plan. Keep transient progress and exact commit review evidence in the PR.

## Verification
Verify every requirement has an implementation and a check or an explicit limit.

## Child DOX index

- [Public repository governance](2026-09-30-01-12-53-public-repository-governance.md): conditionally authorized source/exposure review and GitHub visibility transition, followed by effective main protection; registry and directory publication remain separate.

- [Skill memory inspection](2026-09-29-22-49-00-skill-memory-inspection.md): bounded summaries and cutoff inspection in one read-only evidence snapshot, without new storage or deletion authority.

- [Copilot legacy MCP](2026-09-29-22-12-35-copilot-legacy-mcp.md): native legacy-plugin registration and explicit isolated evidence storage, with disposable CLI verification and no persistent consumer installation.

- [Federated collections pilot](2026-09-29-21-40-26-federated-collections-pilot.md): deterministic two-owner consumer verification of discovery, identity, bounded handoff and refusal, without a new router or real installation.

- [Bump reports and onboarding](2026-09-29-20-48-39-bump-reports-and-onboarding.md): pinned snapshot observations, explicit semantic review and installed walkthroughs without version or evidence-store mutation.

- [Public distribution readiness](2026-09-29-20-16-50-public-distribution-readiness.md): source/history and remote-surface reconciliation plus pinned distribution rehearsal and owner actions, without publication or visibility changes.
- [Native plugin pilot](2026-09-29-19-38-34-native-plugin-pilot.md): isolated native Codex/Claude registration, source-pin replacement, hook/MCP execution and data-preserving cleanup, with explicit model and hosted-update limits.
- [Explicit lifecycle evidence](2026-09-29-20-06-51-explicit-lifecycle-evidence.md): opt-in skill outcomes and complete catalog observations in the preserved evidence store, with bounded CLI/MCP metrics and explicit denominators.
- [Collection maintenance](2026-09-29-19-43-00-collection-maintenance.md): bounded audit, reviewable remediation and explicit catalog-only evolution with verified preimage recovery and pending semantic handoffs.
- [Installed catalog MCP](2026-09-29-19-09-50-installed-catalog-mcp.md): bounded bundled-skill search, resource retrieval and overview through the shared MCP/CLI, with lazy usage storage and no installation effects.
- [Reviewable version preparation](2026-09-29-17-37-32-reviewable-version-preparation.md): manual version-only PR creation, aligned plugin/lock metadata and generated-release verification without publication.
- [Plugin MCP and hook boundary](2026-09-24-22-40-28-plugin-mcp-and-hook-boundary.md): root-plugin MCP and installed hook runtime, persistent host data, proven observation limits and separate native-consumer evidence.
- [Repository plugin marketplace](2026-09-23-18-07-55-repository-plugin-marketplace.md): root host manifests and marketplace entry point at the canonical collection; no consumer installation or publication.
- [Local skill telemetry](2026-09-19-18-00-00-local-skill-telemetry.md): typed observations, session/read trends and bounded local logs; no task tracking or automatic host installation.
- [Meta-skill delivery](2026-09-19-14-34-36-meta-skill-delivery.md): catalog and host adapters, upstream guidance, private packed CLI validation and explicit collection scope.
- [Unified CLI](2026-09-15-14-37-39-unified-cli-n-layer.md): oclif command migration, dynamic discovery, hook/MCP boundaries and cleanup.
- [Skill usage MCP](2026-09-15-16-00-00-skill-usage-mcp.md): explicit local read evidence and rankings in a dedicated transactional usage database.
- [Skill authoring pipeline](2026-09-12-17-29-32-skill-authoring-pipeline.md): the initial collection and its validation workflow.
- [Changesets adoption](2026-09-13-20-14-46-adopt-changesets.md): pending release-note management.
- [Public Wiki mirror](2026-09-13-20-14-57-public-wiki.md): direct `docs/` synchronization to GitHub Wiki.
- [Interactive visual guide](2026-09-13-20-13-49-publish-entry-path-map.md): generated map and GitHub Pages publication.
- [Lifecycle expansion](2026-09-13-20-41-52-01-expand-skill-lifecycle.md): focused lifecycle capabilities and maturity policy.
- [Portable authoring contract](2026-09-13-20-41-52-02-portable-authoring-contract.md): reusable selection, context, handoff, and automation boundaries.
- [Session skill-index hook](2026-09-13-21-25-00-session-skill-index-hook.md): bounded current metadata, unassessed route guidance and on-demand entrypoint locations without activation claims.
- [Structural host compatibility](2026-09-13-22-10-00-skills-host-compatibility.md): repository-local agent discovery alias verification.
- [Portable runtime and setup contract](2026-09-13-23-21-01-portable-runtime-setup-contract.md): explicit runtime and setup declarations for self-contained skills.
- [TypeScript repository tooling assessment](2026-09-13-23-23-25-typescript-tooling-assessment.md): conditional migration recipe for repository-owned CLI tooling.
- [Aggregate skill index](2026-09-14-23-06-58-aggregate-skill-index.md): local SQLite or JSON projection across explicit collection catalogs.
- [Skills maintenance scheduling](2026-09-13-20-52-55-skills-maintenance-scheduling.md): portable proposals for recurring, approval-gated skill maintenance.
- [Global skills catalog](2026-09-14-23-58-02-global-skills-catalog.md): safe standalone catalog synchronization for repository and global collection layouts.
- [Skill evolution event ledger](2026-09-15-01-52-50-skill-evolution-event-ledger.md): ordered SQLite migration and structured, rollback-aware skill evolution events.
