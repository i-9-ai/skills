# Plans

## Purpose
Keep reproducible implementation recipes for architectural changes.

## Ownership
Maintainers own plans; current contracts and code take precedence over historical intent.

## Local contracts
Write in English. Link the related issue, scope, acceptance criteria, verification, and rollback. Treat each material plan as an immutable migration record for its decision: preserve it in Git and create a new zero-padded sequential plan when a later decision adds a distinct scope, dependency, workflow, or external boundary.

## Work guidance
Do not rewrite an earlier plan to absorb a later material decision. Allocate the next unused four-digit sequence, such as `0007-meaningful-slug.md`, and let filenames show implementation order. Never renumber committed plans; a removed plan leaves a gap. Routine wording corrections that do not change intent may update the current plan. Keep transient progress and exact commit review evidence in the PR.

## Verification
Verify every requirement has an implementation and a check or an explicit limit.

## Child DOX index
- [Skill authoring pipeline](0001-skill-authoring-pipeline.md): the initial collection and its validation workflow.
- [Changesets adoption](0002-adopt-changesets.md): pending release-note management.
- [Public Wiki mirror](0003-public-wiki.md): direct `docs/` synchronization to GitHub Wiki.
- [Interactive visual guide](0004-publish-entry-path-map.md): generated map and GitHub Pages publication.
- [Lifecycle expansion](0005-expand-skill-lifecycle.md): focused lifecycle capabilities and maturity policy.
- [Portable authoring contract](0006-portable-authoring-contract.md): reusable selection, context, handoff, and automation boundaries.
