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
- [Meta-skill delivery](2026-09-19-14-34-36-meta-skill-delivery.md): catalog and host adapters, upstream guidance, private packed CLI validation and explicit collection scope.
- [Unified CLI](2026-09-15-14-37-39-unified-cli-n-layer.md): oclif command migration, dynamic discovery, hook/MCP boundaries and cleanup.
- [Skill usage MCP](2026-09-15-16-00-00-skill-usage-mcp.md): explicit local read evidence and rankings in a dedicated transactional usage database.
- [Skill authoring pipeline](2026-09-12-17-29-32-skill-authoring-pipeline.md): the initial collection and its validation workflow.
- [Changesets adoption](2026-09-13-20-14-46-adopt-changesets.md): pending release-note management.
- [Public Wiki mirror](2026-09-13-20-14-57-public-wiki.md): direct `docs/` synchronization to GitHub Wiki.
- [Interactive visual guide](2026-09-13-20-13-49-publish-entry-path-map.md): generated map and GitHub Pages publication.
- [Lifecycle expansion](2026-09-13-20-41-52-01-expand-skill-lifecycle.md): focused lifecycle capabilities and maturity policy.
- [Portable authoring contract](2026-09-13-20-41-52-02-portable-authoring-contract.md): reusable selection, context, handoff, and automation boundaries.
- [Session skill-index hook](2026-09-13-21-25-00-session-skill-index-hook.md): generated entry context from the canonical catalog.
- [Structural host compatibility](2026-09-13-22-10-00-skills-host-compatibility.md): repository-local agent discovery alias verification.
- [Portable runtime and setup contract](2026-09-13-23-21-01-portable-runtime-setup-contract.md): explicit runtime and setup declarations for self-contained skills.
- [TypeScript repository tooling assessment](2026-09-13-23-23-25-typescript-tooling-assessment.md): conditional migration recipe for repository-owned CLI tooling.
- [Aggregate skill index](2026-09-14-23-06-58-aggregate-skill-index.md): local SQLite or JSON projection across explicit collection catalogs.
- [Skills maintenance scheduling](2026-09-13-20-52-55-skills-maintenance-scheduling.md): portable proposals for recurring, approval-gated skill maintenance.
- [Global skills catalog](2026-09-14-23-58-02-global-skills-catalog.md): safe standalone catalog synchronization for repository and global collection layouts.
- [Skill evolution event ledger](2026-09-15-01-52-50-skill-evolution-event-ledger.md): ordered SQLite migration and structured, rollback-aware skill evolution events.
