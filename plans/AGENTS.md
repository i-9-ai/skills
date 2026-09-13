# Plans

## Purpose
Keep reproducible implementation recipes for architectural changes.

## Ownership
Maintainers own plans; current contracts and code take precedence over historical intent.

## Local contracts
Write in English. Link the related issue, scope, acceptance criteria, verification, and rollback. Treat each material plan as an immutable migration record for its decision: preserve it in Git and create a new dated plan when a later decision adds a distinct scope, dependency, workflow, or external boundary.

## Work guidance
Do not rewrite an earlier plan to absorb a later material decision. Create the next dated plan, name its own objective and boundaries, and let chronological filenames show the implementation sequence. Routine wording corrections that do not change intent may update the current plan. Keep transient progress and exact commit review evidence in the PR.

## Verification
Verify every requirement has an implementation and a check or an explicit limit.

## Child DOX index
- [Skill authoring pipeline](2026-09-12-skill-authoring-pipeline.md): the initial collection and its validation workflow.
- [Lifecycle expansion](2026-09-13-expand-skill-lifecycle.md): focused lifecycle capabilities and maturity policy.
- [Portable authoring contract](2026-09-13-portable-authoring-contract.md): reusable selection, context, handoff, and automation boundaries.
- [Changesets adoption](2026-09-13-adopt-changesets.md): pending release-note management.
- [Public Wiki mirror](2026-09-13-public-wiki.md): direct `docs/` synchronization to GitHub Wiki.
- [Interactive visual guide](2026-09-13-publish-entry-path-map.md): generated map and GitHub Pages publication.
