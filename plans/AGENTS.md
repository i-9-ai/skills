# Plans

## Purpose
Keep reproducible implementation recipes for architectural changes.

## Ownership
Maintainers own plans; current contracts and code take precedence over historical intent.

## Local contracts
Write in English. Link the related issue, scope, acceptance criteria, verification, and rollback. Treat each material plan as an immutable migration record for its decision: preserve it in Git and create a new UTC-timestamped plan when a later decision adds a distinct scope, dependency, workflow, or external boundary.

## Work guidance
Do not rewrite an earlier plan to absorb a later material decision. Name plans `YYYY-MM-DD-HH-mm-ss-meaningful-slug.md` in UTC, so lexical order reflects creation time. If two plans are created in the same second, use `-01`, `-02`, and so on before the slug. Never rename a committed plan merely to fill a gap or change its timestamp. Routine wording corrections that do not change intent may update the current plan. Keep transient progress and exact commit review evidence in the PR.

## Verification
Verify every requirement has an implementation and a check or an explicit limit.

## Child DOX index
- [Skill authoring pipeline](2026-09-12-17-29-32-skill-authoring-pipeline.md): the initial collection and its validation workflow.
- [Changesets adoption](2026-09-13-20-14-46-adopt-changesets.md): pending release-note management.
- [Public Wiki mirror](2026-09-13-20-14-57-public-wiki.md): direct `docs/` synchronization to GitHub Wiki.
- [Interactive visual guide](2026-09-13-20-13-49-publish-entry-path-map.md): generated map and GitHub Pages publication.
- [Lifecycle expansion](2026-09-13-20-41-52-01-expand-skill-lifecycle.md): focused lifecycle capabilities and maturity policy.
- [Portable authoring contract](2026-09-13-20-41-52-02-portable-authoring-contract.md): reusable selection, context, handoff, and automation boundaries.
- [Structural host compatibility](2026-09-13-22-10-00-skills-host-compatibility.md): repository-local agent discovery alias verification.
