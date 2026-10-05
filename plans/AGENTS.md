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

- [GitHub module consumer](2026-10-05-16-07-22-github-module-consumer-pilot.md): concrete module roadmap and publicly reproducible local consumer fixture; owner acceptance, source admission and publication remain separate.

- [Exact-revision skill quality](2026-10-04-23-04-39-exact-revision-skill-quality.md): explicit source-qualified conformance/behavioral receipts, preserved evidence history and bounded CLI/MCP queries; no automatic readiness, installation or publication.

- [Global-reference evaluation](2026-10-04-19-15-10-global-reference-evaluation.md): real caller skill references, isolated practical cases and bounded authoring/refactoring repairs; installed packages and historical experiment bytes remain unchanged.

- [Skill behavioral benchmark](2026-10-04-01-25-24-skill-behavioral-benchmark.md): frozen synthetic cases, exact package/artifact identity and declared baseline/treatment evidence; no provider execution engine, automatic readiness claim or publication.

- [Version draft readiness](2026-10-03-22-18-58-version-pr-readiness-checks.md): protected checks on an owner-operated draft-to-ready transition, with preserved PR events and read-only permissions; no new token or publication trigger.

- [GitHub changelog and availability](2026-10-03-20-28-08-github-changelog-and-release-availability.md): reviewed PR references with offline reproduction and anonymous exact-version consumer checks; no historical rewrite or repeat publication.

- [SQLite sidecar stability](2026-10-02-21-01-02-sqlite-sidecar-stability.md): bounded re-observation of legitimately removed SQLite sidecars and deterministic rejection proof; no writer retry or evidence reset.

- [MCP and observer hardening](2026-10-02-17-02-37-mcp-and-observer-hardening.md): installed MCP identity, closed optional observer registration and module admission evidence; local npx launch remains distinct from public HTTPS submission.

- [Public plugin listing](2026-10-02-13-52-37-public-plugin-listing.md): complete presentation metadata, product icon and public policies, with transparent omission of optional persistent-command setup from the public profile; no provider approval claim.

- [Native Codex read evidence](2026-10-01-23-32-56-native-codex-read-evidence.md): trusted native pre/post delivery, one confirmed synthetic read and preserved local ranking evidence inside an OS sandbox; no real-model evaluation.
- [Installed CLI session hooks](2026-10-01-23-20-01-installed-cli-session-hooks.md): explicit installed executable and consumer project selection for generated and verified session context; no settings installation or event-time download.
- [Optional telemetry and public submission](2026-10-01-21-50-00-optional-telemetry-and-public-submission.md): explicit receipt-backed hook setup and a skills-only submission artifact with independent provider approval boundaries.
- [Build Git source receipts](2026-10-01-22-13-33-git-source-receipts.md): bounded compiled-artifact source assertions and inventory verification, without caller Git inference or signature claims.
- [Continuous credential detection](2026-10-01-22-14-29-continuous-secret-detection.md): native push protection and pinned redacted CI scans over actual candidate bytes.
- [Workflow publisher checks](2026-10-01-22-14-29-01-workflow-runtime-and-publisher-checks.md): compatible immutable workflow pins and explicit npm trusted-publisher prerequisites without token fallback.
- [Shared agent telemetry](2026-09-30-20-40-11-shared-agent-telemetry.md): common agent state and supported native read adapters with metadata-only evidence and nonblocking failure.

- [Website GitHub Pages delivery](2026-09-30-20-27-20-website-github-pages.md): catalog website and verified legacy guides in one Pages artifact; release waits for verified deployment.

- [Cloudflare catalog site delivery](2026-09-30-18-31-35-cloudflare-site-delivery.md): authorized native Git previews and main production, with separate indexing modes; website merge approval and existing guide URLs remain independent.
- [Changesets publication and releases](2026-09-30-17-02-00-changesets-publication-and-releases.md): reviewed version PRs, official artifact publication with scoped npm OIDC, and GitHub release/tag creation; historical 0.1.0 metadata recovery never re-uploads npm.
- [Catalog promotion site](2026-09-30-15-57-19-catalog-promotion-site.md): a multilingual static catalog, original visual design and loopback-only preview; no site deployment or Pages routing change before explicit approval.
- [Initial npm publication](2026-09-30-14-43-53-initial-npm-publication.md): reviewed public package metadata and generated version preparation, followed by an authorized tarball upload and anonymous consumer verification; no unattended releases or host installation.

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
