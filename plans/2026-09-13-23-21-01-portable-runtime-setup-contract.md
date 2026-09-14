# Portable runtime and setup contract

## Inaugural baseline consolidation

Consolidated into the initial skill-authoring pipeline before the first release. Retained as decision provenance only; this is not a separately delivered migration.

## Objective

Let a skill declare when it needs a runtime or explicit preparation without making JavaScript, TypeScript, a package manager, or automatic installation mandatory for every package.

## Scope

- Replace the collection-wide JavaScript-only preference with a runtime choice based on documented technical need.
- Add a portable `Prerequisites and setup` contract to the skill template and authoring guidance.
- Validate declared setup metadata and bounded setup resources when a package opts in.
- Document explicit, idempotent setup and a manual fallback.

## Exclusions

- No automatic dependency installation on skill installation, discovery, or activation.
- No repository-wide TypeScript migration.
- No provider-specific bootstrap command, home-directory mutation, or global package installation.
- No new runtime dependency unless separately justified.

## Authority boundaries

This change may alter repository templates, validation, tests, and documentation. It does not authorize installing dependencies into consumer environments, publishing, releasing, merging, or changing a host configuration.

## Implementation sequence

1. Define a small optional frontmatter contract for runtime requirements and setup entrypoints.
2. Update the authoring template and guidance to choose JavaScript or TypeScript from a concrete portability and maintenance rationale.
3. Extend collection validation and synthetic fixtures for valid, missing, unsafe, and non-idempotent declarations.
4. Update public documentation with the explicit setup lifecycle and fallback.
5. Add a Changeset, run local checks, and obtain independent review before delivery.

## Acceptance criteria

- A package without setup remains valid and has no additional runtime burden.
- An opted-in package declares a bounded relative setup entrypoint, prerequisites, idempotence, side effects, and fallback.
- Setup is described as explicit only; no package metadata grants automatic execution.
- JavaScript remains appropriate for small zero-dependency utilities; TypeScript is allowed when its concrete advantage and runnable distribution path are documented.
- Validation rejects unsafe paths and incomplete declarations.

## Validation

Run `npm run check`, `npm run changeset:status`, `git diff --check`, and the official validator in CI for the exact pull-request head.

## Rollback

Revert the focused commit set. Opt-in setup declarations stay inert until a user invokes the documented command, so no consumer cleanup is required.
